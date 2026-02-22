//! AST-to-Markdown serializer.
//!
//! Converts an mdast AST back into Markdown text.
//! Matches the output style of remark-stringify with:
//! - `-` for bullet lists
//! - `` ` `` for fenced code blocks
//! - `*` for emphasis and strong

use markdown::mdast::Node;

/// Serialize an mdast AST node to Markdown string.
pub fn serialize(node: &Node) -> String {
    let mut output = String::new();
    serialize_node(node, &mut output, &SerializeContext::default());
    // Trim trailing whitespace per line and collapse multiple blank lines
    let trimmed = output
        .lines()
        .map(|l| l.trim_end())
        .collect::<Vec<_>>()
        .join("\n");
    trimmed.trim().to_string()
}

#[derive(Default, Clone)]
struct SerializeContext {
    /// Current list nesting depth
    list_depth: usize,
    /// Whether we're inside a tight list
    tight: bool,
}

fn serialize_node(node: &Node, out: &mut String, ctx: &SerializeContext) {
    match node {
        Node::Root(root) => {
            serialize_children(&root.children, out, ctx);
        }
        Node::Yaml(yaml) => {
            out.push_str("---\n");
            out.push_str(&yaml.value);
            out.push_str("\n---\n\n");
        }
        Node::Heading(heading) => {
            for _ in 0..heading.depth {
                out.push('#');
            }
            out.push(' ');
            serialize_inline_children(&heading.children, out, ctx);
            out.push_str("\n\n");
        }
        Node::Paragraph(para) => {
            serialize_inline_children(&para.children, out, ctx);
            out.push_str("\n\n");
        }
        Node::Text(text) => {
            out.push_str(&text.value);
        }
        Node::Strong(strong) => {
            out.push_str("**");
            serialize_inline_children(&strong.children, out, ctx);
            out.push_str("**");
        }
        Node::Emphasis(em) => {
            out.push('*');
            serialize_inline_children(&em.children, out, ctx);
            out.push('*');
        }
        Node::InlineCode(code) => {
            out.push('`');
            out.push_str(&code.value);
            out.push('`');
        }
        Node::Code(code) => {
            out.push_str("```");
            if let Some(lang) = &code.lang {
                out.push_str(lang);
            }
            out.push('\n');
            out.push_str(&code.value);
            out.push_str("\n```\n\n");
        }
        Node::Link(link) => {
            out.push('[');
            serialize_inline_children(&link.children, out, ctx);
            out.push_str("](");
            out.push_str(&link.url);
            if let Some(title) = &link.title {
                out.push_str(" \"");
                out.push_str(title);
                out.push('"');
            }
            out.push(')');
        }
        Node::Image(img) => {
            out.push_str("![");
            out.push_str(&img.alt);
            out.push_str("](");
            out.push_str(&img.url);
            if let Some(title) = &img.title {
                out.push_str(" \"");
                out.push_str(title);
                out.push('"');
            }
            out.push(')');
        }
        Node::List(list) => {
            let child_ctx = SerializeContext {
                list_depth: ctx.list_depth + 1,
                tight: !list.spread,
            };
            for (i, child) in list.children.iter().enumerate() {
                if let Node::ListItem(item) = child {
                    let indent = "  ".repeat(ctx.list_depth);
                    if list.ordered {
                        let start = list.start.unwrap_or(1) as usize;
                        out.push_str(&format!("{}{}. ", indent, start + i));
                    } else {
                        out.push_str(&format!("{}- ", indent));
                    }
                    serialize_list_item_children(&item.children, out, &child_ctx);
                    if !child_ctx.tight || i < list.children.len() - 1 {
                        // Don't add extra newline for tight lists
                        if child_ctx.tight {
                            out.push('\n');
                        }
                    }
                }
            }
            out.push('\n');
        }
        Node::ListItem(item) => {
            // Handled by List
            serialize_children(&item.children, out, ctx);
        }
        Node::Blockquote(bq) => {
            let content = {
                let mut buf = String::new();
                serialize_children(&bq.children, &mut buf, ctx);
                buf
            };
            for line in content.trim_end().lines() {
                if line.is_empty() {
                    out.push_str(">\n");
                } else {
                    out.push_str("> ");
                    out.push_str(line);
                    out.push('\n');
                }
            }
            out.push('\n');
        }
        Node::ThematicBreak(_) => {
            out.push_str("---\n\n");
        }
        Node::Html(html) => {
            out.push_str(&html.value);
            out.push_str("\n\n");
        }
        Node::Table(table) => {
            serialize_table(table, out);
        }
        Node::Delete(del) => {
            out.push_str("~~");
            serialize_inline_children(&del.children, out, ctx);
            out.push_str("~~");
        }
        Node::Break(_) => {
            out.push_str("\\\n");
        }
        // MDX nodes — these should be handled by the transformer before serialization.
        // If they reach here, output them as-is or skip.
        Node::MdxFlowExpression(expr) => {
            out.push('{');
            out.push_str(&expr.value);
            out.push_str("}\n\n");
        }
        Node::MdxTextExpression(expr) => {
            out.push('{');
            out.push_str(&expr.value);
            out.push('}');
        }
        Node::MdxjsEsm(esm) => {
            out.push_str(&esm.value);
            out.push_str("\n\n");
        }
        Node::MdxJsxFlowElement(_) | Node::MdxJsxTextElement(_) => {
            // JSX elements that weren't transformed — skip
        }
        // Nodes we don't need to handle specially
        Node::Definition(def) => {
            out.push_str(&format!("[{}]: {}", def.identifier, def.url));
            if let Some(title) = &def.title {
                out.push_str(&format!(" \"{}\"", title));
            }
            out.push_str("\n\n");
        }
        Node::FootnoteDefinition(fd) => {
            out.push_str(&format!("[^{}]: ", fd.identifier));
            serialize_children(&fd.children, out, ctx);
        }
        Node::FootnoteReference(fr) => {
            out.push_str(&format!("[^{}]", fr.identifier));
        }
        Node::ImageReference(ir) => {
            out.push_str(&format!("![{}][{}]", ir.alt, ir.identifier));
        }
        Node::LinkReference(lr) => {
            out.push('[');
            serialize_inline_children(&lr.children, out, ctx);
            out.push_str(&format!("][{}]", lr.identifier));
        }
        // Catch-all for any remaining node types
        _ => {}
    }
}

fn serialize_children(children: &[Node], out: &mut String, ctx: &SerializeContext) {
    for child in children {
        serialize_node(child, out, ctx);
    }
}

fn serialize_inline_children(children: &[Node], out: &mut String, ctx: &SerializeContext) {
    for child in children {
        serialize_node(child, out, ctx);
    }
}

fn serialize_list_item_children(children: &[Node], out: &mut String, ctx: &SerializeContext) {
    for (i, child) in children.iter().enumerate() {
        match child {
            Node::Paragraph(para) => {
                serialize_inline_children(&para.children, out, ctx);
                if i < children.len() - 1 {
                    out.push('\n');
                }
            }
            Node::List(_) => {
                out.push('\n');
                serialize_node(child, out, ctx);
            }
            _ => {
                serialize_node(child, out, ctx);
            }
        }
    }
}

fn serialize_table(table: &markdown::mdast::Table, out: &mut String) {
    if table.children.is_empty() {
        return;
    }

    // Header row
    if let Some(Node::TableRow(header)) = table.children.first() {
        out.push('|');
        for cell in &header.children {
            if let Node::TableCell(tc) = cell {
                out.push(' ');
                let mut buf = String::new();
                serialize_inline_children(&tc.children, &mut buf, &SerializeContext::default());
                out.push_str(&buf);
                out.push_str(" |");
            }
        }
        out.push('\n');

        // Separator row
        out.push('|');
        for (i, _) in header.children.iter().enumerate() {
            let align = table.align.get(i).copied().unwrap_or(markdown::mdast::AlignKind::None);
            match align {
                markdown::mdast::AlignKind::Left => out.push_str(" :--- |"),
                markdown::mdast::AlignKind::Right => out.push_str(" ---: |"),
                markdown::mdast::AlignKind::Center => out.push_str(" :---: |"),
                markdown::mdast::AlignKind::None => out.push_str(" --- |"),
            }
        }
        out.push('\n');
    }

    // Data rows
    for row in table.children.iter().skip(1) {
        if let Node::TableRow(tr) = row {
            out.push('|');
            for cell in &tr.children {
                if let Node::TableCell(tc) = cell {
                    out.push(' ');
                    let mut buf = String::new();
                    serialize_inline_children(&tc.children, &mut buf, &SerializeContext::default());
                    out.push_str(&buf);
                    out.push_str(" |");
                }
            }
            out.push('\n');
        }
    }
    out.push('\n');
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parser::parse_mdx;

    fn roundtrip(input: &str) -> String {
        let ast = parse_mdx(input).unwrap();
        serialize(&ast)
    }

    #[test]
    fn test_heading() {
        assert_eq!(roundtrip("# Hello\n"), "# Hello");
    }

    #[test]
    fn test_paragraph() {
        assert_eq!(roundtrip("Hello world\n"), "Hello world");
    }

    #[test]
    fn test_code_block() {
        let input = "```js\nconsole.log(\"hi\")\n```\n";
        let output = roundtrip(input);
        assert!(output.contains("```js"));
        assert!(output.contains("console.log"));
    }

    #[test]
    fn test_list() {
        let input = "- item 1\n- item 2\n- item 3\n";
        let output = roundtrip(input);
        assert!(output.contains("- item 1"));
        assert!(output.contains("- item 2"));
        assert!(output.contains("- item 3"));
    }

    #[test]
    fn test_link() {
        let input = "[text](https://example.com)\n";
        let output = roundtrip(input);
        assert!(output.contains("[text](https://example.com)"));
    }

    #[test]
    fn test_strong_emphasis() {
        let input = "**bold** and *italic*\n";
        let output = roundtrip(input);
        assert!(output.contains("**bold**"));
        assert!(output.contains("*italic*"));
    }

    #[test]
    fn test_frontmatter() {
        let input = "---\ntitle: test\n---\n\n# Hello\n";
        let output = roundtrip(input);
        assert!(output.starts_with("---\ntitle: test\n---"));
        assert!(output.contains("# Hello"));
    }

    #[test]
    fn test_blockquote() {
        let input = "> quoted text\n";
        let output = roundtrip(input);
        assert!(output.contains("> quoted text"));
    }

    #[test]
    fn test_table() {
        let input = "| a | b |\n| - | - |\n| 1 | 2 |\n";
        let output = roundtrip(input);
        assert!(output.contains("| a |"));
        assert!(output.contains("| 1 |"));
    }
}
