use std::process::ExitCode;

pub fn install() -> ExitCode {
    tnmsc::bridge::node::run_node_command("install", &[])
}

pub fn dry_run() -> ExitCode {
    tnmsc::bridge::node::run_node_command("dry-run", &[])
}

pub fn clean() -> ExitCode {
    tnmsc::bridge::node::run_node_command("clean", &[])
}

pub fn dry_run_clean() -> ExitCode {
    tnmsc::bridge::node::run_node_command("clean", &["--dry-run"])
}

pub fn plugins() -> ExitCode {
    tnmsc::bridge::node::run_node_command("plugins", &[])
}
