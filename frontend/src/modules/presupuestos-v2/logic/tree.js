export function descendantsOf(rows, containerId) {
  if (containerId === "all") return new Set(rows.map((row) => row.id));
  const ids = new Set([containerId]);
  let added = true;
  while (added) {
    added = false;
    rows.forEach((row) => {
      if (row.parentId && ids.has(row.parentId) && !ids.has(row.id)) {
        ids.add(row.id);
        added = true;
      }
    });
  }
  return ids;
}

export function visibleContainers(rows, collapsedIds) {
  const hidden = new Set();
  const hideChildren = (containerId) => {
    rows.forEach((row) => {
      if (row.parentId === containerId) {
        hidden.add(row.id);
        if (row.kind === "container") hideChildren(row.id);
      }
    });
  };
  collapsedIds.forEach((id) => hideChildren(id));
  return rows.filter((row) => row.kind === "container" && !hidden.has(row.id));
}

export function treeStatusClass(row) {
  if (row.pending > 0 || row.revisar > 0) return "budget-v2-tree-dot-warning";
  if (row.sinApu > 0) return "budget-v2-tree-dot-muted";
  return "budget-v2-tree-dot-ok";
}
