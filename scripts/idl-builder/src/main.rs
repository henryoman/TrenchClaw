use anchor_lang_idl::build::IdlBuilder;
use std::path::PathBuf;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = std::env::args().skip(1);
    let program_path = PathBuf::from(args.next().ok_or("Missing program path")?);
    let output_path = PathBuf::from(args.next().ok_or("Missing output path")?);
    // 0.1.4 passes a literal +{toolchain} when Cargo supplies this variable.
    // Use the installed default compiler without invoking its broken selector.
    std::env::remove_var("RUSTUP_TOOLCHAIN");
    let idl = IdlBuilder::new()
        .program_path(program_path)
        .cargo_args(vec!["--locked".into()])
        .build()?;
    std::fs::write(output_path, serde_json::to_string_pretty(&idl)? + "\n")?;
    Ok(())
}
