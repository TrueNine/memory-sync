use assert_cmd::Command;

#[test]
fn assemble_npm_does_not_write_human_output_to_stdout() {
  // Fixes #225: stdout belongs to MCP JSON-RPC framing, so human-readable
  // package command failures must stay on stderr.
  Command::cargo_bin("tnmsm")
    .expect("tnmsm binary should be available")
    .args(["assemble-npm", "--profile", "missing-profile-for-issue-225"])
    .assert()
    .failure()
    .stdout("")
    .stderr(predicates::str::contains(
      "Error: Missing local host binary",
    ));
}
