//! Replay a local capture through the same import boundary as the running helper.
//! Reports counts and unresolved paths without printing account records or requests.
use jaswa_helper::profile::ProfileStore;
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
    let expected_runes = env::args()
        .nth(2)
        .map(|value| value.parse::<usize>())
        .transpose()?;
    let path = env::args_os().nth(1).map(PathBuf::from).unwrap_or_else(|| {
        PathBuf::from(
            env::var_os("USERPROFILE")
                .or_else(|| env::var_os("HOME"))
                .unwrap_or_default(),
        )
        .join("Downloads/JASWA Helper traffic.log")
    });
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
            if let Some(reason) = store.unmodeled_exchange(response, request) {
                gaps += 1;
                println!("UNRESOLVED line {} {command}: {reason}", index + 1);
                // Continue the audit to find every gap; the live service pauses at the first.
                continue;
            }
            store.apply_update(response, request);
            if let Some(reason) = store.take_declined().1 {
                gaps += 1;
                println!("REFUSED line {} {command}: {reason}", index + 1);
            }
            exchanges += 1;
        }
    }
    if logins == 0 {
        return Err("No login in capture; nothing was replayed".into());
    }
    println!(
        "Replayed {exchanges} exchanges after {logins} login(s); {gaps} unresolved exchanges."
    );
    let final_counts = counts(&store.read().unwrap().data);
    println!("Final counts: {final_counts:?} (roster, runes, artifacts, relics, craft stacks)");
    if gaps != 0 {
        return Err("Capture contains unresolved account exchanges".into());
    }
    if expected_runes.is_some_and(|expected| expected != final_counts[1]) {
        return Err(format!(
            "Expected {} runes, replay produced {}",
            expected_runes.unwrap(),
            final_counts[1]
        )
        .into());
    }
    Ok(())
}
