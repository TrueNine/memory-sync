use std::process::ExitCode;

pub fn execute() -> ExitCode {
    println!("tnmsc — Memory Sync CLI");
    println!();
    println!("USAGE:");
    println!("  tnmsc [OPTIONS] [COMMAND]");
    println!();
    println!("COMMANDS:");
    println!("  (default)    Run the default install pipeline");
    println!("  install      Run the install pipeline explicitly");
    println!("  dry-run      Preview changes without writing files");
    println!("  clean        Remove all generated output files");
    println!("  plugins      List all registered plugins");
    println!("  version      Show version information");
    println!("  help         Show this help message");
    println!();
    println!("OPTIONS:");
    println!("  --trace      Set log level to trace");
    println!("  --debug      Set log level to debug");
    println!("  --info       Set log level to info");
    println!("  --warn       Set log level to warn");
    println!("  --error      Set log level to error");
    println!();
    println!("CONFIGURATION:");
    println!("  Global user config: ~/.aindex/.tnmsc.json");
    println!("  Project runtime assembly: plugin.config.ts");
    ExitCode::SUCCESS
}
