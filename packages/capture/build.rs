use std::{error::Error, fmt::Write as _, path::PathBuf};

/// Read by Electron as well, so both sides of the input sidecar take their bounds from one file.
const INPUT_SIDECAR_LIMITS_CONTRACT: &str = "contracts/input-sidecar-limits.json";

/// Contract field, generated constant name, and what the bound protects.
const INPUT_SIDECAR_LIMIT_FIELDS: [(&str, &str, &str); 3] = [
    (
        "maximumSidecarBytes",
        "MAXIMUM_INPUT_SIDECAR_BYTES",
        "Largest input sidecar file a reader accepts, checked before the file is read.",
    ),
    (
        "maximumSidecarEvents",
        "MAXIMUM_INPUT_SIDECAR_EVENTS",
        "Most events an input sidecar may hold before a reader refuses it.",
    ),
    (
        "maximumKeystrokeEvents",
        "MAXIMUM_KEYSTROKE_EVENTS",
        "Most keystroke events recorded in one session, so typing alone cannot push a sidecar past the event bound.",
    ),
];

fn main() -> Result<(), Box<dyn Error>> {
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-changed={INPUT_SIDECAR_LIMITS_CONTRACT}");
    write_input_sidecar_limits()?;

    #[cfg(target_os = "macos")]
    {
        // Swift runtime libraries shipped with macOS.
        println!("cargo:rustc-link-arg=-Wl,-rpath,/usr/lib/swift");

        // Support both a standalone binary and the packaged Beam.app layout.
        println!("cargo:rustc-link-arg=-Wl,-rpath,@executable_path/");
        println!("cargo:rustc-link-arg=-Wl,-rpath,@executable_path/../Frameworks");
        println!("cargo:rustc-link-arg=-Wl,-rpath,@loader_path");
    }
    Ok(())
}

fn write_input_sidecar_limits() -> Result<(), Box<dyn Error>> {
    let contract: serde_json::Map<String, serde_json::Value> =
        serde_json::from_str(&std::fs::read_to_string(INPUT_SIDECAR_LIMITS_CONTRACT)?)?;
    let known_fields = INPUT_SIDECAR_LIMIT_FIELDS.map(|(field, _, _)| field);
    if let Some(unknown_field) = contract
        .keys()
        .find(|field| !known_fields.contains(&field.as_str()))
    {
        return Err(
            format!("{INPUT_SIDECAR_LIMITS_CONTRACT}: unknown field {unknown_field}").into(),
        );
    }
    let mut generated_source = String::new();
    for (field, constant_name, purpose) in INPUT_SIDECAR_LIMIT_FIELDS {
        let bound = contract
            .get(field)
            .and_then(serde_json::Value::as_u64)
            .ok_or_else(|| {
                format!("{INPUT_SIDECAR_LIMITS_CONTRACT}: {field} must be a whole number")
            })?;
        writeln!(generated_source, "/// {purpose}")?;
        writeln!(
            generated_source,
            "pub const {constant_name}: u64 = {bound};"
        )?;
    }
    let output_directory = PathBuf::from(std::env::var("OUT_DIR")?);
    std::fs::write(
        output_directory.join("input_sidecar_limits.rs"),
        generated_source,
    )?;
    Ok(())
}
