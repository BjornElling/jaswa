//! Replay a local capture through the same import boundary as the running helper.
//! Reports counts and missed changes without printing account records or requests.
use base64::{Engine as _, engine::general_purpose::STANDARD};
use jaswa_helper::profile::ProfileStore;
use jaswa_helper::protocol::{decode_request, decode_response};
use serde_json::Value;
use std::{
    collections::BTreeSet,
    env,
    fs::File,
    io::{BufRead, BufReader},
    path::PathBuf,
};

fn counts(data: &Value) -> Vec<usize> {
    [
        "unit_list",
        "runes",
        "artifacts",
        "relics",
        "rune_craft_item_list",
    ]
    .iter()
    .map(|collection| {
        let key = match *collection {
            "unit_list" => "unit_id",
            "runes" => "rune_id",
            "rune_craft_item_list" => "craft_item_id",
            _ => "rid",
        };
        let mut ids = BTreeSet::new();
        let mut add = |items: Option<&Vec<Value>>| {
            for item in items.into_iter().flatten() {
                if let Some(id) = item.get(key) {
                    ids.insert(id.to_string());
                }
            }
        };
        add(data.get(*collection).and_then(Value::as_array));
        if matches!(*collection, "runes" | "artifacts") {
            for unit in data
                .get("unit_list")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
            {
                add(unit.get(*collection).and_then(Value::as_array));
            }
        }
        ids.len()
    })
    .collect()
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut arguments = env::args_os().skip(1);
    let path = arguments.next().map(PathBuf::from).unwrap_or_else(|| {
        PathBuf::from(
            env::var_os("USERPROFILE")
                .or_else(|| env::var_os("HOME"))
                .unwrap_or_default(),
        )
        .join("Downloads/JASWA Helper traffic.log")
    });
    let mut expected_runes = None;
    let mut write_profile = None;
    while let Some(argument) = arguments.next() {
        if argument == "--write-profile" {
            write_profile = Some(PathBuf::from(
                arguments.next().ok_or("Missing output path")?,
            ));
        } else {
            expected_runes = Some(
                argument
                    .to_str()
                    .ok_or("Invalid rune count")?
                    .parse::<usize>()?,
            );
        }
    }
    if let Ok(report) = serde_json::from_reader::<_, Value>(File::open(&path)?) {
        if let Some(failure) = report
            .pointer("/incidents/firstFailure")
            .filter(|value| value.is_object())
        {
            let baseline = failure
                .pointer("/profileBeforeFailure/data")
                .ok_or("Report has no account baseline")?;
            let request = decode_request(&report_body(failure, "requestBase64")?)?;
            let response = decode_response(&report_body(failure, "responseBase64")?)?;
            let mut store = ProfileStore::default();
            if !store.accept_snapshot(baseline.clone()) {
                return Err("Invalid report baseline".into());
            }
            let before = counts(&store.read().unwrap().data);
            store.apply_update(&response, &request);
            let missed = store.take_declined().missed;
            if !missed.is_empty() {
                return Err(missed.join("; ").into());
            }
            println!(
                "Incident replay: {:?} -> {:?} (roster, runes, artifacts, relics, craft stacks)",
                before,
                counts(&store.read().unwrap().data)
            );
            if request.get("command").and_then(Value::as_str) == Some("SellRune") {
                let sold = request
                    .get("rune_id_list")
                    .and_then(Value::as_array)
                    .ok_or("Sale has no ids")?;
                let after = store.read().unwrap().data;
                let remaining = after
                    .get("runes")
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten()
                    .chain(
                        after
                            .get("unit_list")
                            .and_then(Value::as_array)
                            .into_iter()
                            .flatten()
                            .flat_map(|unit| {
                                unit.get("runes")
                                    .and_then(Value::as_array)
                                    .into_iter()
                                    .flatten()
                            }),
                    );
                if remaining
                    .into_iter()
                    .any(|rune| rune.get("rune_id").is_some_and(|id| sold.contains(id)))
                {
                    return Err("A sold rune remains in the replayed account".into());
                }
                println!(
                    "All {} sold rune ids are absent after the sale.",
                    sold.len()
                );
            }
            return finish(&store, expected_runes, write_profile);
        }
    }
    let file = File::open(&path)?;
    let mut store = ProfileStore::default();
    let mut exchanges = 0;
    let mut logins = 0;
    let mut gaps = 0;
    for (index, line) in BufReader::new(file).lines().enumerate() {
        let entry: Value = serde_json::from_str(&line?)?;
        let (Some(response), Some(request)) = (entry.get("response"), entry.get("request")) else {
            continue;
        };
        let command = request
            .get("command")
            .and_then(Value::as_str)
            .unwrap_or("(unnamed)");
        if matches!(command, "HubUserLogin" | "GuestLogin") {
            if !store.accept_snapshot(response.clone()) {
                return Err(format!("Invalid login at line {}", index + 1).into());
            }
            logins += 1;
            println!(
                "Login at line {}: {:?} (roster, runes, artifacts, relics, craft stacks)",
                index + 1,
                counts(&store.read().unwrap().data)
            );
        } else if store.read().is_some() {
            store.apply_update(response, request);
            let missed = store.take_declined().missed;
            if !missed.is_empty() {
                gaps += 1;
                println!("MISSED line {} {command}: {}", index + 1, missed.join("; "));
            }
            exchanges += 1;
        }
    }
    if logins == 0 {
        return Err("No login in capture; nothing was replayed".into());
    }
    println!(
        "Replayed {exchanges} exchanges after {logins} login(s); {gaps} exchanges with missed changes."
    );
    if gaps != 0 {
        return Err("Capture contains account changes JASWA missed".into());
    }
    finish(&store, expected_runes, write_profile)
}

fn report_body(failure: &Value, field: &str) -> Result<String, Box<dyn std::error::Error>> {
    let raw = STANDARD.decode(
        failure
            .get(field)
            .and_then(Value::as_str)
            .ok_or("Report has no wire message")?,
    )?;
    let end = raw
        .windows(4)
        .position(|bytes| bytes == b"\r\n\r\n")
        .ok_or("Report has no HTTP body")?;
    Ok(String::from_utf8(raw[end + 4..].to_vec())?
        .trim()
        .to_owned())
}

fn finish(
    store: &ProfileStore,
    expected_runes: Option<usize>,
    write_profile: Option<PathBuf>,
) -> Result<(), Box<dyn std::error::Error>> {
    let profile = store.read().ok_or("No replayed account")?;
    let final_counts = counts(&profile.data);
    println!("Final counts: {final_counts:?} (roster, runes, artifacts, relics, craft stacks)");
    if expected_runes.is_some_and(|expected| expected != final_counts[1]) {
        return Err(format!(
            "Expected {} runes, replay produced {}",
            expected_runes.unwrap(),
            final_counts[1]
        )
        .into());
    }
    if let Some(path) = write_profile {
        std::fs::write(path, serde_json::to_vec(&profile)?)?;
    }
    Ok(())
}
