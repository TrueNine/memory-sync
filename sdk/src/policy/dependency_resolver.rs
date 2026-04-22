use std::collections::{HashMap, VecDeque};

#[derive(Debug, serde::Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum DependencyResolverError {
  MissingDependency {
    node_name: String,
    missing_dependency: String,
  },
  CircularDependency {
    cycle_path: Vec<String>,
  },
}

#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DependencyNodeInput {
  pub name: String,
  #[serde(default)]
  pub depends_on: Vec<String>,
}

fn find_cycle_path(
  nodes: &[DependencyNodeInput],
  in_degree: &HashMap<String, usize>,
) -> Vec<String> {
  let cycle_nodes: std::collections::HashSet<String> = in_degree
    .iter()
    .filter(|(_, d)| **d > 0)
    .map(|(n, _)| n.clone())
    .collect();

  let mut deps: HashMap<String, Vec<String>> = HashMap::new();
  for node in nodes {
    if cycle_nodes.contains(&node.name) {
      let filtered: Vec<String> = node
        .depends_on
        .iter()
        .filter(|&d| cycle_nodes.contains(d))
        .cloned()
        .collect();
      deps.insert(node.name.clone(), filtered);
    }
  }

  let mut visited = std::collections::HashSet::new();
  for start in &cycle_nodes {
    let mut path: Vec<String> = Vec::new();
    let mut local_visited = std::collections::HashSet::new();
    if dfs_find_cycle(start, &deps, &mut path, &mut local_visited) {
      if let Some(last) = path.last()
        && let Some(cycle_start) = path.iter().position(|n| n == last)
      {
        return path[cycle_start..].to_vec();
      }
      return path;
    }
    visited.insert(start.clone());
  }
  cycle_nodes.into_iter().collect()
}

fn dfs_find_cycle(
  node: &str,
  deps: &HashMap<String, Vec<String>>,
  path: &mut Vec<String>,
  visited: &mut std::collections::HashSet<String>,
) -> bool {
  if path.contains(&node.to_string()) {
    path.push(node.to_string());
    return true;
  }
  if visited.contains(node) {
    return false;
  }
  visited.insert(node.to_string());
  path.push(node.to_string());

  for dep in deps.get(node).unwrap_or(&Vec::new()) {
    if dfs_find_cycle(dep, deps, path, visited) {
      return true;
    }
  }
  path.pop();
  false
}

pub fn topological_sort_nodes(
  nodes: &[DependencyNodeInput],
) -> Result<Vec<String>, DependencyResolverError> {
  let node_names: std::collections::HashSet<String> =
    nodes.iter().map(|n| n.name.clone()).collect();

  for node in nodes {
    for dep in &node.depends_on {
      if !node_names.contains(dep) {
        return Err(DependencyResolverError::MissingDependency {
          node_name: node.name.clone(),
          missing_dependency: dep.clone(),
        });
      }
    }
  }

  let mut in_degree: HashMap<String, usize> = HashMap::new();
  let mut dependents: HashMap<String, Vec<String>> = HashMap::new();
  for node in nodes {
    in_degree.insert(node.name.clone(), 0);
    dependents.insert(node.name.clone(), Vec::new());
  }

  for node in nodes {
    for dep in &node.depends_on {
      *in_degree.get_mut(&node.name).unwrap() += 1;
      dependents.get_mut(dep).unwrap().push(node.name.clone());
    }
  }

  let mut queue: VecDeque<String> = VecDeque::new();
  for node in nodes {
    if in_degree.get(&node.name).copied().unwrap_or(0) == 0 {
      queue.push_back(node.name.clone());
    }
  }

  let mut result: Vec<String> = Vec::new();
  let node_index_map: HashMap<String, usize> = nodes
    .iter()
    .enumerate()
    .map(|(i, n)| (n.name.clone(), i))
    .collect();

  while let Some(current) = queue.pop_front() {
    result.push(current.clone());

    let mut current_dependents = dependents.get(&current).cloned().unwrap_or_default();
    current_dependents.sort_by(|a, b| {
      let idx_a = node_index_map.get(a).copied().unwrap_or(usize::MAX);
      let idx_b = node_index_map.get(b).copied().unwrap_or(usize::MAX);
      idx_a.cmp(&idx_b)
    });

    for dependent in current_dependents {
      let new_degree = in_degree.get_mut(&dependent).unwrap();
      *new_degree -= 1;
      if *new_degree == 0 {
        queue.push_back(dependent);
      }
    }
  }

  if result.len() == nodes.len() {
    Ok(result)
  } else {
    let cycle_path = find_cycle_path(nodes, &in_degree);
    Err(DependencyResolverError::CircularDependency { cycle_path })
  }
}

pub fn topological_sort(input_json: &str) -> Result<String, DependencyResolverError> {
  let nodes: Vec<DependencyNodeInput> =
    serde_json::from_str(input_json).map_err(|e| DependencyResolverError::MissingDependency {
      node_name: format!("invalid input: {}", e),
      missing_dependency: String::new(),
    })?;

  topological_sort_nodes(&nodes).map(|sorted| serde_json::to_string(&sorted).unwrap())
}

#[cfg(test)]
mod tests {
  use super::*;

  fn nodes_from(names: &[&str], deps: &[Vec<&str>]) -> Vec<DependencyNodeInput> {
    names
      .iter()
      .zip(deps.iter())
      .map(|(name, d)| DependencyNodeInput {
        name: name.to_string(),
        depends_on: d.iter().map(|s| s.to_string()).collect(),
      })
      .collect()
  }

  #[test]
  fn sorts_nodes_with_no_dependencies() {
    let nodes = nodes_from(&["a", "b", "c"], &[vec![], vec![], vec![]]);
    let sorted = topological_sort_nodes(&nodes).unwrap();
    assert_eq!(sorted, vec!["a", "b", "c"]);
  }

  #[test]
  fn respects_dependency_order() {
    let nodes = nodes_from(&["a", "b", "c"], &[vec![], vec!["a"], vec!["b"]]);
    let sorted = topological_sort_nodes(&nodes).unwrap();
    assert_eq!(sorted, vec!["a", "b", "c"]);
  }

  #[test]
  fn preserves_registration_order_for_same_level() {
    let nodes = nodes_from(&["x", "y", "z"], &[vec![], vec![], vec![]]);
    let sorted = topological_sort_nodes(&nodes).unwrap();
    assert_eq!(sorted, vec!["x", "y", "z"]);
  }

  #[test]
  fn preserves_registration_order_for_dependents() {
    let nodes = nodes_from(
      &["a", "b", "c", "d"],
      &[vec![], vec![], vec!["a"], vec!["a"]],
    );
    let sorted = topological_sort_nodes(&nodes).unwrap();
    assert_eq!(sorted, vec!["a", "b", "c", "d"]);
  }

  #[test]
  fn detects_missing_dependency() {
    let nodes = nodes_from(&["a"], &[vec!["missing"]]);
    let err = topological_sort_nodes(&nodes).unwrap_err();
    match err {
      DependencyResolverError::MissingDependency {
        node_name,
        missing_dependency,
      } => {
        assert_eq!(node_name, "a");
        assert_eq!(missing_dependency, "missing");
      }
      _ => panic!("Expected MissingDependency error, got {:?}", err),
    }
  }

  #[test]
  fn detects_simple_cycle() {
    let nodes = nodes_from(&["a", "b"], &[vec!["b"], vec!["a"]]);
    let err = topological_sort_nodes(&nodes).unwrap_err();
    match err {
      DependencyResolverError::CircularDependency { cycle_path } => {
        assert!(cycle_path.contains(&"a".to_string()));
        assert!(cycle_path.contains(&"b".to_string()));
      }
      _ => panic!("Expected CircularDependency error, got {:?}", err),
    }
  }

  #[test]
  fn detects_self_cycle() {
    let nodes = nodes_from(&["a"], &[vec!["a"]]);
    let err = topological_sort_nodes(&nodes).unwrap_err();
    match err {
      DependencyResolverError::CircularDependency { cycle_path } => {
        assert!(cycle_path.contains(&"a".to_string()));
      }
      _ => panic!("Expected CircularDependency error, got {:?}", err),
    }
  }

  #[test]
  fn detects_cycle_with_unrelated_nodes() {
    let nodes = nodes_from(
      &["a", "b", "c", "d"],
      &[vec![], vec!["c"], vec!["d"], vec!["b"]],
    );
    let result = topological_sort_nodes(&nodes);
    assert!(result.is_err());
  }

  #[test]
  fn complex_graph_sorts_correctly() {
    let nodes = nodes_from(
      &["a", "b", "c", "d", "e"],
      &[vec![], vec!["a"], vec!["a"], vec!["b", "c"], vec![]],
    );
    let sorted = topological_sort_nodes(&nodes).unwrap();
    assert_eq!(sorted[0], "a");
    assert_eq!(sorted[1], "e");
    let b_idx = sorted.iter().position(|s| s == "b").unwrap();
    let c_idx = sorted.iter().position(|s| s == "c").unwrap();
    assert!(b_idx < c_idx);
    let d_idx = sorted.iter().position(|s| s == "d").unwrap();
    assert!(d_idx > b_idx);
    assert!(d_idx > c_idx);
  }

  #[test]
  fn topological_sort_json_still_works() {
    let nodes = nodes_from(&["a", "b"], &[vec![], vec!["a"]]);
    let result = topological_sort(&serde_json::to_string(&nodes).unwrap()).unwrap();
    let sorted: Vec<String> = serde_json::from_str(&result).unwrap();
    assert_eq!(sorted, vec!["a", "b"]);
  }

  #[test]
  fn find_cycle_path_extracts_cycle_only() {
    let nodes = nodes_from(&["a", "b", "c"], &[vec!["b"], vec!["c"], vec!["b"]]);
    let mut in_degree: HashMap<String, usize> = HashMap::new();
    in_degree.insert("a".to_string(), 0);
    in_degree.insert("b".to_string(), 1);
    in_degree.insert("c".to_string(), 1);
    let path = find_cycle_path(&nodes, &in_degree);
    assert!(path.contains(&"b".to_string()));
    assert!(path.contains(&"c".to_string()));
    assert!(!path.contains(&"a".to_string()));
  }
}
