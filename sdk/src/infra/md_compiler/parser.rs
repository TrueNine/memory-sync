//! MDX parser using `markdown-rs`.
//!
//! Parses MDX source into an mdast AST with MDX extensions, GFM, and frontmatter.

use markdown::{mdast::Node, to_mdast, ParseOptions};

/// Parse an MDX string into an mdast AST.
///
/// Enables: MDX (JSX, expressions, ESM), GFM (tables, task lists, strikethrough),
/// and YAML frontmatter — matching the TS remark-parse + remark-mdx + remark-gfm + remark-frontmatter setup.
pub fn parse_mdx(source: &str) -> Result<Node, String> {
  let mut options = ParseOptions::mdx();
  options.constructs.frontmatter = true;
  options.constructs.gfm_autolink_literal = true;
  options.constructs.gfm_strikethrough = true;
  options.constructs.gfm_table = true;
  options.constructs.gfm_task_list_item = true;

  to_mdast(source, &options).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
  use super::*;
  use markdown::mdast::Node;

  #[test]
  fn test_parse_simple_markdown() {
    let result = parse_mdx("# Hello\n\nWorld\n");
    assert!(result.is_ok());
    let node = result.unwrap();
    match &node {
      Node::Root(root) => {
        assert!(root.children.len() >= 2);
      }
      _ => panic!("Expected Root node"),
    }
  }

  #[test]
  fn test_parse_frontmatter() {
    let result = parse_mdx("---\ntitle: test\n---\n\n# Hello\n");
    assert!(result.is_ok());
    let node = result.unwrap();
    match &node {
      Node::Root(root) => {
        assert!(matches!(&root.children[0], Node::Yaml(_)));
      }
      _ => panic!("Expected Root node"),
    }
  }

  #[test]
  fn test_parse_mdx_expression() {
    let result = parse_mdx("Text with {expr} inline\n");
    assert!(result.is_ok());
  }

  #[test]
  fn test_parse_mdx_jsx_flow() {
    let result = parse_mdx("<Md when={true}>\n  content\n</Md>\n");
    assert!(result.is_ok());
    let node = result.unwrap();
    match &node {
      Node::Root(root) => {
        let has_jsx = root
          .children
          .iter()
          .any(|c| matches!(c, Node::MdxJsxFlowElement(_)));
        assert!(has_jsx, "Expected MdxJsxFlowElement");
      }
      _ => panic!("Expected Root node"),
    }
  }

  #[test]
  fn test_parse_gfm_table() {
    let result = parse_mdx("| a | b |\n| - | - |\n| 1 | 2 |\n");
    assert!(result.is_ok());
    let node = result.unwrap();
    match &node {
      Node::Root(root) => {
        let has_table = root.children.iter().any(|c| matches!(c, Node::Table(_)));
        assert!(has_table, "Expected Table node");
      }
      _ => panic!("Expected Root node"),
    }
  }
}
