#[test]
#[ignore = "verification scaffold"]
fn db_ports_range_constraint() {
    let _steps = [
        "Create in-memory DB and apply migrations",
        "Insert account with imap_port=0",
        "Expect constraint violation",
    ];
    let _ = _steps;
}

#[test]
#[ignore = "verification scaffold"]
fn db_sync_interval_bounds() {
    let _steps = [
        "Create in-memory DB and apply migrations",
        "Insert account with sync_interval=0",
        "Expect constraint violation",
    ];
    let _ = _steps;
}

#[test]
#[ignore = "verification scaffold"]
fn db_message_id_unique() {
    let _steps = [
        "Create in-memory DB and apply migrations",
        "Insert two emails with same message_id for account",
        "Expect unique constraint violation",
    ];
    let _ = _steps;
}

#[test]
#[ignore = "verification scaffold"]
fn db_attachment_size_constraint() {
    let _steps = [
        "Create in-memory DB and apply migrations",
        "Insert attachment size > limit",
        "Expect constraint violation",
    ];
    let _ = _steps;
}

#[test]
#[ignore = "verification scaffold"]
fn db_cascade_delete_folder_emails_attachments() {
    let _steps = [
        "Create in-memory DB and apply migrations",
        "Insert folder with emails and attachments",
        "Delete folder and assert cascade removal",
    ];
    let _ = _steps;
}
