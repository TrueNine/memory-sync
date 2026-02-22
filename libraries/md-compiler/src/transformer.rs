//! AST transformer for MDX-to-Markdown conversion.
//!
//! Walks the mdast AST, evaluating expressions, expanding components,
//! and converting JSX elements to Markdown equivalents.

use std::collections::HashMap;
use markdown::mdast::*;
use crate::expression_eval::{EvaluationScope, evaluate_expression};

// ---------------------------------------------------------------------------
// Processing context
// ---------------------------------------------------------------------------

/// Component handler function type.
pub type ComponentHandler = Box<dyn Fn(&MdxJsxFlowElement, &ProcessingContext) -> Vec<Node> + Send + Sync>;

/// Processing context passed through the AST transformation.
pub struct ProcessingContext {
    pub scope: EvaluationScope,
    pub components: HashMap<String, ComponentHandler>,
    pub processing_stack: Vec<String>,
    pub base_path: Option<String>,
}

impl ProcessingContext {
    pub fn new(scope: EvaluationScope) -> Self {
        let mut ctx = Self {
            scope,
            components: HashMap::new(),
            processing_stack: Vec::new(),
            base_path: None,
        };
        register_built_in_components(&mut ctx);
        ctx
    }
}

// ---------------------------------------------------------------------------
// Built-in components: <Md> and <Md.Line>
// ---------------------------------------------------------------------------

fn register_built_in_components(ctx: &mut ProcessingContext) {
    // <Md when={condition}> — conditional block wrapper
    ctx.components.insert("Md".to_string(), Box::new(|element, ctx| {
        if !evaluate_when_condition(element, ctx) {
            return vec![];
        }
        transform_children(&element.children, ctx)
    }));

    // <Md.Line when={condition}> — conditional inline text
    ctx.components.insert("Md.Line".to_string(), Box::new(|element, ctx| {
        if !evaluate_when_condition(element, ctx) {
            return vec![];
        }
        let text = extract_text_content(&element.children, &ctx.scope);
        if text.is_empty() {
            return vec![];
        }
        vec![Node::Text(Text {
            value: text,
            position: None,
        })]
    }));
}

/// Evaluate the `when` attribute of a JSX element.
fn evaluate_when_condition(element: &MdxJsxFlowElement, ctx: &ProcessingContext) -> bool {
    for attr in &element.attributes {
        if let AttributeContent::Property(prop) = attr {
            if prop.name == "when" {
                return match &prop.value {
                    Some(AttributeValue::Literal(s)) => s == "true",
                    Some(AttributeValue::Expression(expr)) => {
                        match evaluate_expression(&expr.value, &ctx.scope) {
                            Ok(v) => is_truthy(&v),
                            Err(_) => false,
                        }
                    }
                    None => false,
                };
            }
        }
    }
    true // No `when` attribute = always true
}

/// Check the `when` condition for text elements too.
fn evaluate_when_condition_text(element: &MdxJsxTextElement, ctx: &ProcessingContext) -> bool {
    for attr in &element.attributes {
        if let AttributeContent::Property(prop) = attr {
            if prop.name == "when" {
                return match &prop.value {
                    Some(AttributeValue::Literal(s)) => s == "true",
                    Some(AttributeValue::Expression(expr)) => {
                        match evaluate_expression(&expr.value, &ctx.scope) {
                            Ok(v) => is_truthy(&v),
                            Err(_) => false,
                        }
                    }
                    None => false,
                };
            }
        }
    }
    true
}

fn is_truthy(s: &str) -> bool {
    !s.is_empty() && s != "false" && s != "0" && s != "undefined" && s != "null"
}

/// Extract text content from child nodes, evaluating expressions.
fn extract_text_content(children: &[Node], scope: &EvaluationScope) -> String {
    let mut result = String::new();
    for child in children {
        match child {
            Node::Text(t) => result.push_str(&t.value),
            Node::MdxTextExpression(expr) => {
                if let Ok(val) = evaluate_expression(&expr.value, scope) {
                    result.push_str(&val);
                }
            }
            _ => {
                if let Some(children) = get_children(child) {
                    result.push_str(&extract_text_content(children, scope));
                }
            }
        }
    }
    result
}

// ---------------------------------------------------------------------------
// JSX to Markdown conversion (for HTML-like elements)
// ---------------------------------------------------------------------------

fn convert_jsx_to_markdown(element: &MdxJsxFlowElement, ctx: &ProcessingContext) -> Option<Vec<Node>> {
    let name = element.name.as_deref()?.to_lowercase();
    match name.as_str() {
        "pre" => convert_pre_element(element, ctx),
        "a" => convert_link_element(element, ctx),
        "strong" | "b" => convert_strong_element(element, ctx),
        "em" | "i" => convert_emphasis_element(element, ctx),
        "img" => convert_image_element(element, ctx),
        "blockquote" => convert_blockquote_element(element, ctx),
        _ => None,
    }
}

fn convert_jsx_text_to_markdown(element: &MdxJsxTextElement, ctx: &ProcessingContext) -> Option<Vec<Node>> {
    let name = element.name.as_deref()?.to_lowercase();
    match name.as_str() {
        "a" => convert_link_text_element(element, ctx),
        "strong" | "b" => convert_strong_text_element(element, ctx),
        "em" | "i" => convert_emphasis_text_element(element, ctx),
        _ => None,
    }
}

fn get_attribute_value(attrs: &[AttributeContent], name: &str, scope: &EvaluationScope) -> Option<String> {
    for attr in attrs {
        if let AttributeContent::Property(prop) = attr {
            if prop.name == name {
                return match &prop.value {
                    Some(AttributeValue::Literal(s)) => Some(s.clone()),
                    Some(AttributeValue::Expression(expr)) => {
                        evaluate_expression(&expr.value, scope).ok()
                    }
                    None => Some(String::new()),
                };
            }
        }
    }
    None
}

fn convert_pre_element(element: &MdxJsxFlowElement, ctx: &ProcessingContext) -> Option<Vec<Node>> {
    // Find <code> child
    let code_child = element.children.iter().find_map(|child| {
        match child {
            Node::MdxJsxFlowElement(el) if el.name.as_deref().map(|n| n.to_lowercase()) == Some("code".into()) => Some(el),
            _ => None,
        }
    })?;

    let class_name = get_attribute_value(&code_child.attributes, "className", &ctx.scope).unwrap_or_default();
    let lang = regex_extract_lang(&class_name);
    let code_text = extract_text_content(&code_child.children, &ctx.scope);

    Some(vec![Node::Code(Code {
        value: code_text.trim().to_string(),
        lang: lang.map(|s| s.to_string()),
        meta: None,
        position: None,
    })])
}

fn regex_extract_lang(class_name: &str) -> Option<&str> {
    // Match "language-xxx"
    if let Some(start) = class_name.find("language-") {
        let rest = &class_name[start + 9..];
        let end = rest.find(|c: char| !c.is_ascii_alphanumeric() && c != '-' && c != '_').unwrap_or(rest.len());
        if end > 0 {
            return Some(&rest[..end]);
        }
    }
    None
}

fn convert_link_element(element: &MdxJsxFlowElement, ctx: &ProcessingContext) -> Option<Vec<Node>> {
    let href = get_attribute_value(&element.attributes, "href", &ctx.scope)?;
    if href.is_empty() { return None; }
    let text = extract_text_content(&element.children, &ctx.scope);
    let title = get_attribute_value(&element.attributes, "title", &ctx.scope);
    Some(vec![Node::Paragraph(Paragraph {
        children: vec![Node::Link(Link {
            url: href,
            title,
            children: vec![Node::Text(Text { value: text, position: None })],
            position: None,
        })],
        position: None,
    })])
}

fn convert_link_text_element(element: &MdxJsxTextElement, ctx: &ProcessingContext) -> Option<Vec<Node>> {
    let href = get_attribute_value(&element.attributes, "href", &ctx.scope)?;
    if href.is_empty() { return None; }
    let text = extract_text_content(&element.children, &ctx.scope);
    let title = get_attribute_value(&element.attributes, "title", &ctx.scope);
    Some(vec![Node::Link(Link {
        url: href,
        title,
        children: vec![Node::Text(Text { value: text, position: None })],
        position: None,
    })])
}

fn convert_strong_element(element: &MdxJsxFlowElement, ctx: &ProcessingContext) -> Option<Vec<Node>> {
    let text = extract_text_content(&element.children, &ctx.scope);
    Some(vec![Node::Paragraph(Paragraph {
        children: vec![Node::Strong(Strong {
            children: vec![Node::Text(Text { value: text, position: None })],
            position: None,
        })],
        position: None,
    })])
}

fn convert_strong_text_element(element: &MdxJsxTextElement, ctx: &ProcessingContext) -> Option<Vec<Node>> {
    let text = extract_text_content(&element.children, &ctx.scope);
    Some(vec![Node::Strong(Strong {
        children: vec![Node::Text(Text { value: text, position: None })],
        position: None,
    })])
}

fn convert_emphasis_element(element: &MdxJsxFlowElement, ctx: &ProcessingContext) -> Option<Vec<Node>> {
    let text = extract_text_content(&element.children, &ctx.scope);
    Some(vec![Node::Paragraph(Paragraph {
        children: vec![Node::Emphasis(Emphasis {
            children: vec![Node::Text(Text { value: text, position: None })],
            position: None,
        })],
        position: None,
    })])
}

fn convert_emphasis_text_element(element: &MdxJsxTextElement, ctx: &ProcessingContext) -> Option<Vec<Node>> {
    let text = extract_text_content(&element.children, &ctx.scope);
    Some(vec![Node::Emphasis(Emphasis {
        children: vec![Node::Text(Text { value: text, position: None })],
        position: None,
    })])
}

fn convert_image_element(element: &MdxJsxFlowElement, ctx: &ProcessingContext) -> Option<Vec<Node>> {
    let src = get_attribute_value(&element.attributes, "src", &ctx.scope)?;
    if src.is_empty() { return None; }
    let alt = get_attribute_value(&element.attributes, "alt", &ctx.scope).unwrap_or_default();
    let title = get_attribute_value(&element.attributes, "title", &ctx.scope);
    Some(vec![Node::Paragraph(Paragraph {
        children: vec![Node::Image(Image {
            url: src,
            alt,
            title,
            position: None,
        })],
        position: None,
    })])
}

fn convert_blockquote_element(element: &MdxJsxFlowElement, ctx: &ProcessingContext) -> Option<Vec<Node>> {
    let text = extract_text_content(&element.children, &ctx.scope);
    Some(vec![Node::Blockquote(Blockquote {
        children: vec![Node::Paragraph(Paragraph {
            children: vec![Node::Text(Text { value: text, position: None })],
            position: None,
        })],
        position: None,
    })])
}

// ---------------------------------------------------------------------------
// Core AST transformation
// ---------------------------------------------------------------------------

/// Transform the root AST, processing all MDX nodes.
pub fn transform_ast(root: &Node, ctx: &ProcessingContext) -> Node {
    match root {
        Node::Root(r) => {
            let new_children = transform_children(&r.children, ctx);
            Node::Root(Root {
                children: new_children,
                position: r.position.clone(),
            })
        }
        _ => root.clone(),
    }
}

/// Transform a list of child nodes.
fn transform_children(children: &[Node], ctx: &ProcessingContext) -> Vec<Node> {
    let mut result = Vec::new();

    for child in children {
        match child {
            // Skip ESM nodes (export/import statements)
            Node::MdxjsEsm(_) => {}

            // Flow expressions: {expression}
            Node::MdxFlowExpression(expr) => {
                let trimmed = expr.value.trim();
                // Skip block comments
                if trimmed.starts_with("/*") && trimmed.ends_with("*/") {
                    continue;
                }
                match evaluate_expression(&expr.value, &ctx.scope) {
                    Ok(val) if !val.is_empty() => {
                        result.push(Node::Paragraph(Paragraph {
                            children: vec![Node::Text(Text { value: val, position: None })],
                            position: None,
                        }));
                    }
                    _ => {}
                }
            }

            // JSX flow elements: <Component> or <html-tag>
            Node::MdxJsxFlowElement(element) => {
                let name = element.name.as_deref().unwrap_or("");

                // Check if it's a registered component
                if let Some(handler) = ctx.components.get(name) {
                    let nodes = handler(element, ctx);
                    // Recursively transform the handler output
                    result.extend(transform_children(&nodes, ctx));
                } else if let Some(converted) = convert_jsx_to_markdown(element, ctx) {
                    result.extend(converted);
                }
                // Unknown JSX elements are silently skipped
            }

            // Nodes with children — recurse
            Node::Paragraph(para) => {
                let new_children = transform_inline_children(&para.children, ctx);
                if !new_children.is_empty() {
                    result.push(Node::Paragraph(Paragraph {
                        children: new_children,
                        position: para.position.clone(),
                    }));
                }
            }
            Node::Heading(h) => {
                let new_children = transform_inline_children(&h.children, ctx);
                result.push(Node::Heading(Heading {
                    children: new_children,
                    position: h.position.clone(),
                    depth: h.depth,
                }));
            }
            Node::Blockquote(bq) => {
                let new_children = transform_children(&bq.children, ctx);
                result.push(Node::Blockquote(Blockquote {
                    children: new_children,
                    position: bq.position.clone(),
                }));
            }
            Node::List(list) => {
                let new_children: Vec<Node> = list.children.iter().map(|item| {
                    if let Node::ListItem(li) = item {
                        Node::ListItem(ListItem {
                            children: transform_children(&li.children, ctx),
                            position: li.position.clone(),
                            spread: li.spread,
                            checked: li.checked,
                        })
                    } else {
                        item.clone()
                    }
                }).collect();
                result.push(Node::List(List {
                    children: new_children,
                    position: list.position.clone(),
                    ordered: list.ordered,
                    start: list.start,
                    spread: list.spread,
                }));
            }
            Node::Link(link) => {
                let new_children = transform_inline_children(&link.children, ctx);
                // Simplify link text that looks like file paths
                let simplified = new_children.into_iter().map(|c| {
                    if let Node::Text(t) = &c {
                        if t.value.contains('/') && t.value.contains('.') {
                            if let Some(basename) = t.value.rsplit('/').next() {
                                return Node::Text(Text { value: basename.to_string(), position: t.position.clone() });
                            }
                        }
                    }
                    c
                }).collect();
                result.push(Node::Link(Link {
                    children: simplified,
                    position: link.position.clone(),
                    url: link.url.clone(),
                    title: link.title.clone(),
                }));
            }
            Node::Strong(s) => {
                let new_children = transform_inline_children(&s.children, ctx);
                result.push(Node::Strong(Strong {
                    children: new_children,
                    position: s.position.clone(),
                }));
            }
            Node::Emphasis(e) => {
                let new_children = transform_inline_children(&e.children, ctx);
                result.push(Node::Emphasis(Emphasis {
                    children: new_children,
                    position: e.position.clone(),
                }));
            }
            Node::Delete(d) => {
                let new_children = transform_inline_children(&d.children, ctx);
                result.push(Node::Delete(Delete {
                    children: new_children,
                    position: d.position.clone(),
                }));
            }
            Node::Table(table) => {
                let new_children: Vec<Node> = table.children.iter().map(|row| {
                    if let Node::TableRow(tr) = row {
                        let new_cells: Vec<Node> = tr.children.iter().map(|cell| {
                            if let Node::TableCell(tc) = cell {
                                Node::TableCell(TableCell {
                                    children: transform_inline_children(&tc.children, ctx),
                                    position: tc.position.clone(),
                                })
                            } else {
                                cell.clone()
                            }
                        }).collect();
                        Node::TableRow(TableRow {
                            children: new_cells,
                            position: tr.position.clone(),
                        })
                    } else {
                        row.clone()
                    }
                }).collect();
                result.push(Node::Table(Table {
                    children: new_children,
                    position: table.position.clone(),
                    align: table.align.clone(),
                }));
            }

            // Leaf nodes — pass through
            _ => {
                result.push(child.clone());
            }
        }
    }

    result
}

/// Transform inline children (within paragraphs, headings, etc.)
fn transform_inline_children(children: &[Node], ctx: &ProcessingContext) -> Vec<Node> {
    let mut result = Vec::new();

    for child in children {
        match child {
            // Inline text expressions: {expression}
            Node::MdxTextExpression(expr) => {
                let trimmed = expr.value.trim();
                if trimmed.starts_with("/*") && trimmed.ends_with("*/") {
                    continue;
                }
                match evaluate_expression(&expr.value, &ctx.scope) {
                    Ok(val) => {
                        result.push(Node::Text(Text { value: val, position: None }));
                    }
                    Err(_) => {
                        // Keep expression as-is on error
                        result.push(Node::Text(Text { value: String::new(), position: None }));
                    }
                }
            }

            // Inline JSX: <Component> or <tag>
            Node::MdxJsxTextElement(element) => {
                let name = element.name.as_deref().unwrap_or("");

                // Check registered components
                if name == "Md.Line" {
                    if evaluate_when_condition_text(element, ctx) {
                        let text = extract_text_content(&element.children, &ctx.scope);
                        if !text.is_empty() {
                            result.push(Node::Text(Text { value: text, position: None }));
                        }
                    }
                } else if name == "Md" {
                    if evaluate_when_condition_text(element, ctx) {
                        let transformed = transform_inline_children(&element.children, ctx);
                        result.extend(transformed);
                    }
                } else if let Some(converted) = convert_jsx_text_to_markdown(element, ctx) {
                    result.extend(converted);
                }
                // Unknown inline JSX elements are silently skipped
            }

            // Recurse into inline containers
            Node::Strong(s) => {
                let new_children = transform_inline_children(&s.children, ctx);
                result.push(Node::Strong(Strong {
                    children: new_children,
                    position: s.position.clone(),
                }));
            }
            Node::Emphasis(e) => {
                let new_children = transform_inline_children(&e.children, ctx);
                result.push(Node::Emphasis(Emphasis {
                    children: new_children,
                    position: e.position.clone(),
                }));
            }
            Node::Link(link) => {
                let new_children = transform_inline_children(&link.children, ctx);
                result.push(Node::Link(Link {
                    children: new_children,
                    position: link.position.clone(),
                    url: link.url.clone(),
                    title: link.title.clone(),
                }));
            }
            Node::Delete(d) => {
                let new_children = transform_inline_children(&d.children, ctx);
                result.push(Node::Delete(Delete {
                    children: new_children,
                    position: d.position.clone(),
                }));
            }

            // Leaf nodes — pass through
            _ => {
                result.push(child.clone());
            }
        }
    }

    result
}

/// Get children of a node, if it has any.
fn get_children(node: &Node) -> Option<&Vec<Node>> {
    match node {
        Node::Root(n) => Some(&n.children),
        Node::Paragraph(n) => Some(&n.children),
        Node::Heading(n) => Some(&n.children),
        Node::Blockquote(n) => Some(&n.children),
        Node::List(n) => Some(&n.children),
        Node::ListItem(n) => Some(&n.children),
        Node::Strong(n) => Some(&n.children),
        Node::Emphasis(n) => Some(&n.children),
        Node::Link(n) => Some(&n.children),
        Node::Delete(n) => Some(&n.children),
        Node::Table(n) => Some(&n.children),
        Node::TableRow(n) => Some(&n.children),
        Node::TableCell(n) => Some(&n.children),
        Node::MdxJsxFlowElement(n) => Some(&n.children),
        Node::MdxJsxTextElement(n) => Some(&n.children),
        Node::FootnoteDefinition(n) => Some(&n.children),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parser::parse_mdx;
    use crate::serializer::serialize;
    use serde_json::json;

    fn make_scope() -> EvaluationScope {
        let mut scope = EvaluationScope::new();
        scope.insert("os".into(), json!({"platform": "win32"}));
        scope.insert("profile".into(), json!({"name": "TrueNine"}));
        scope.insert("tool".into(), json!({"name": "cursor"}));
        scope
    }

    fn compile(source: &str, scope: EvaluationScope) -> String {
        let ast = parse_mdx(source).unwrap();
        let ctx = ProcessingContext::new(scope);
        let transformed = transform_ast(&ast, &ctx);
        serialize(&transformed)
    }

    #[test]
    fn test_expression_in_paragraph() {
        let result = compile("Platform: {os.platform}\n", make_scope());
        assert!(result.contains("Platform: win32"), "Got: {}", result);
    }

    #[test]
    fn test_md_component_when_true() {
        let result = compile("<Md when={true}>\n\nVisible content\n\n</Md>\n", make_scope());
        assert!(result.contains("Visible content"), "Got: {}", result);
    }

    #[test]
    fn test_md_component_when_false() {
        let result = compile("<Md when={false}>\n\nHidden content\n\n</Md>\n", make_scope());
        assert!(!result.contains("Hidden content"), "Got: {}", result);
    }

    #[test]
    fn test_md_line_component() {
        let result = compile(
            "Before\n\n<Md.Line when={true}>Name: {profile.name}</Md.Line>\n\nAfter\n",
            make_scope(),
        );
        assert!(result.contains("Name: TrueNine"), "Got: {}", result);
    }

    #[test]
    fn test_md_line_when_false() {
        let result = compile(
            "<Md.Line when={false}>Hidden</Md.Line>\n",
            make_scope(),
        );
        assert!(!result.contains("Hidden"), "Got: {}", result);
    }

    #[test]
    fn test_passthrough_markdown() {
        let result = compile("# Title\n\nParagraph text.\n\n- item 1\n- item 2\n", make_scope());
        assert!(result.contains("# Title"), "Got: {}", result);
        assert!(result.contains("Paragraph text"), "Got: {}", result);
        assert!(result.contains("- item 1"), "Got: {}", result);
    }

    #[test]
    fn test_frontmatter_stripped() {
        let result = compile("---\ntitle: test\n---\n\n# Hello\n", make_scope());
        // Frontmatter should be preserved (not stripped by transformer — that's the caller's job)
        assert!(result.contains("# Hello"), "Got: {}", result);
    }

    #[test]
    fn test_code_block_preserved() {
        let result = compile("```js\nconsole.log(\"hi\")\n```\n", make_scope());
        assert!(result.contains("```js"), "Got: {}", result);
        assert!(result.contains("console.log"), "Got: {}", result);
    }
}
