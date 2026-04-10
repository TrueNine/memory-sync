use std::process::ExitCode;

pub fn install() -> ExitCode {
    tnmsc::run_install_cli()
}

pub fn dry_run() -> ExitCode {
    tnmsc::run_dry_run_cli()
}

pub fn clean() -> ExitCode {
    tnmsc::run_clean_cli(false)
}

pub fn dry_run_clean() -> ExitCode {
    tnmsc::run_clean_cli(true)
}

pub fn plugins() -> ExitCode {
    let plugins = tnmsc::list_plugins();

    println!("# Registered plugins");
    println!();

    if plugins.is_empty() {
        println!("- No plugins are currently registered.");
    } else {
        for plugin in plugins {
            if plugin.dependencies.is_empty() {
                println!("- {}", plugin.name);
            } else {
                println!(
                    "- {} (depends on: {})",
                    plugin.name,
                    plugin.dependencies.join(", ")
                );
            }
        }
    }

    ExitCode::SUCCESS
}
