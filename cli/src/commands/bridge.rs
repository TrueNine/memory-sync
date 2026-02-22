use std::process::ExitCode;

use crate::bridge::node::run_node_command;

pub fn execute(json_mode: bool) -> ExitCode {
    run_node_command("execute", json_mode, &[])
}

pub fn dry_run(json_mode: bool) -> ExitCode {
    run_node_command("dry-run", json_mode, &[])
}

pub fn clean(json_mode: bool) -> ExitCode {
    run_node_command("clean", json_mode, &[])
}

pub fn dry_run_clean(json_mode: bool) -> ExitCode {
    run_node_command("clean", json_mode, &["--dry-run"])
}

pub fn plugins(json_mode: bool) -> ExitCode {
    run_node_command("plugins", json_mode, &[])
}
