//! Replay a local capture through the same import boundary as the running helper.
//! Reports counts and missed changes without printing account records or requests.
use base64::{Engine as _, engine::general_purpose::STANDARD};
use jaswa_helper::profile::{ProfileStore, requires_account_response};
use jaswa_helper::protocol::{decode_request, decode_response};
use serde_json::Value;
use std::{
    borrow::Cow,
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
    let store = replay_capture(BufReader::new(File::open(&path)?))?;
    finish(&store, expected_runes, write_profile)
}

fn replay_capture(input: impl BufRead) -> Result<ProfileStore, Box<dyn std::error::Error>> {
    let mut store = ProfileStore::default();
    let mut exchanges = 0;
    let mut logins = 0;
    let mut gaps = 0;
    let mut auxiliary = 0;
    let mut started = false;
    for (index, line) in input.lines().enumerate() {
        let entry: Value = serde_json::from_str(&line?)?;
        if index == 0 {
            if entry.get("event").and_then(Value::as_str) != Some("capture-started")
                || entry.get("at").and_then(Value::as_str).is_none_or(str::is_empty)
            {
                return Err("Capture has no recording boundary; it cannot establish that unreadable exchanges were recorded.".into());
            }
            started = true;
            continue;
        }
        let (request, response): (Cow<'_, Value>, Cow<'_, Value>) = if let Some(reason) = entry.get("decodeError") {
            let reason = reason.as_str().filter(|reason| !reason.is_empty())
                .ok_or("Capture has an invalid decode error")?;
            let request = decode_request(&report_body(&entry, "requestBase64")?)
                .map_err(|error| format!("Unreadable request at line {}: {error}",index+1))?;
            let command = request.get("command").and_then(Value::as_str).filter(|command| !command.is_empty())
                .ok_or("Unreadable exchange has no request command")?;
            let response_body = report_body(&entry,"responseBase64");
            let decoded = response_body.and_then(|body| decode_response(&body).map_err(Into::into));
            let response = match decoded {
                Ok(response) if response.is_object() => response,
                Ok(_) => return Err(format!("Response at line {} is not an object",index+1).into()),
                Err(_) if !matches!(command,"HubUserLogin"|"GuestLogin") && !requires_account_response(&request) => {
                    auxiliary += 1;
                    println!("Auxiliary exchange at line {} {command} is outside account capture: {reason}",index+1);
                    continue;
                }
                Err(error) => return Err(format!("Unreadable {command} at line {}: {error} (recorded: {reason})",index+1).into()),
            };
            (Cow::Owned(request),Cow::Owned(response))
        } else {
            (Cow::Borrowed(entry.get("request").filter(|value| value.is_object()).ok_or("Capture exchange has no request object")?),
             Cow::Borrowed(entry.get("response").filter(|value| value.is_object()).ok_or("Capture exchange has no response object")?))
        };
        let command = request
            .get("command")
            .and_then(Value::as_str)
            .filter(|command| !command.is_empty())
            .ok_or("Capture exchange has no command name")?;
        if matches!(command, "HubUserLogin" | "GuestLogin") {
            if !store.accept_snapshot(response.into_owned()) {
                return Err(format!("Invalid login at line {}", index + 1).into());
            }
            logins += 1;
            println!(
                "Login at line {}: {:?} (roster, runes, artifacts, relics, craft stacks)",
                index + 1,
                counts(&store.read().unwrap().data)
            );
        } else if store.read().is_some() {
            store.apply_update(&response, &request);
            let missed = store.take_declined().missed;
            if !missed.is_empty() {
                gaps += 1;
                println!("MISSED line {} {command}: {}", index + 1, missed.join("; "));
            }
            exchanges += 1;
        }
    }
    if !started || logins == 0 {
        return Err("No login in capture; nothing was replayed".into());
    }
    println!(
        "Replayed {exchanges} exchanges after {logins} login(s); {gaps} exchanges with missed changes."
    );
    println!("Excluded {auxiliary} unreadable auxiliary exchanges; every recorded account exchange was checked.");
    if gaps != 0 {
        return Err("Capture contains account changes JASWA missed".into());
    }
    Ok(store)
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
    Ok(String::from_utf8(raw[end + 4..].to_vec())?)
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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::io::{Cursor,Write};

    fn entries() -> Vec<Value> {
        vec![json!({"event":"capture-started","at":"2026-11-01T20:00:00Z"}),
            json!({"request":{"command":"HubUserLogin"},"response":{"unit_list":[],"runes":[]}})]
    }

    fn input(entries: Vec<Value>) -> Cursor<String> {
        Cursor::new(entries.iter().map(Value::to_string).collect::<Vec<_>>().join("\n"))
    }

    fn request_wire(command: &str) -> Vec<u8> {
        use cipher::{BlockEncryptMut,KeyIvInit,block_padding::Pkcs7};
        let plain = serde_json::to_vec(&json!({"command":command})).unwrap();
        let mut buffer = vec![0;plain.len()+16];
        buffer[..plain.len()].copy_from_slice(&plain);
        let body = STANDARD.encode(cbc::Encryptor::<aes::Aes128>::new_from_slices(b"Gr4S2eiNl7zq5MrU",&[0;16]).unwrap()
            .encrypt_padded_mut::<Pkcs7>(&mut buffer,plain.len()).unwrap());
        format!("POST /api/gateway_c2.php HTTP/1.1\r\nContent-Length: {}\r\n\r\n{body}",body.len()).into_bytes()
    }

    fn opaque(command: &str) -> Value {
        json!({"command":command,"decodeError":"private envelope",
            "requestBase64":STANDARD.encode(request_wire(command)),
            "responseBase64":STANDARD.encode(b"HTTP/1.1 200 OK\r\nContent-Length: 20\r\n\r\nVv2XRzS1O1AW8FuVxxxx")})
    }

    #[test]
    fn unreadable_raid_cannot_be_a_successful_replay() {
        let mut log = entries();
        log.push(opaque("BattleRiftOfWorldsRaidResult"));
        let error = replay_capture(input(log)).err().expect("an opaque award must fail the audit").to_string();
        assert!(error.contains("Unreadable BattleRiftOfWorldsRaidResult at line 3"));
    }

    #[test]
    fn auxiliary_envelopes_are_explicitly_excluded_and_later_awards_arrive() {
        let mut log = entries();
        log.push(opaque("GetRiftOfWorldsRaidServerInfo"));
        log.push(json!({"request":{"command":"BattleDungeonResult_V2"},"response":{"runes":[{"rune_id":5,"set_id":13}]}}));
        let profile = replay_capture(input(log)).unwrap().read().unwrap();
        assert_eq!(profile.data["runes"][0]["rune_id"],5);
    }

    #[test]
    fn missing_boundary_and_malformed_exchanges_never_disappear() {
        assert!(replay_capture(input(entries().into_iter().skip(1).collect())).err().unwrap().to_string().contains("recording boundary"));
        let mut log = entries();log.push(json!({"unrecognised":"entry"}));
        assert!(replay_capture(input(log)).is_err());
    }

    #[test]
    fn unreadable_wire_is_rechecked_by_the_current_decoder() {
        use cipher::{BlockEncryptMut,KeyIvInit,block_padding::Pkcs7};
        let mut zipper=flate2::write::ZlibEncoder::new(Vec::new(),flate2::Compression::default());
        zipper.write_all(b"{\"ret_code\":0}").unwrap();
        let plain=zipper.finish().unwrap();let mut buffer=vec![0;plain.len()+16];
        buffer[..plain.len()].copy_from_slice(&plain);
        let body=STANDARD.encode(cbc::Encryptor::<aes::Aes128>::new_from_slices(b"Gr4S2eiNl7zq5MrU",&[0;16]).unwrap()
            .encrypt_padded_mut::<Pkcs7>(&mut buffer,plain.len()).unwrap());
        let mut entry=opaque("BattleDungeonResult_V2");
        entry["responseBase64"]=json!(STANDARD.encode(format!("HTTP/1.1 200 OK\r\nContent-Length: {}\r\n\r\n{body}",body.len())));
        let mut log=entries();log.push(entry);
        assert!(replay_capture(input(log)).unwrap().status().has_profile);
    }
}
