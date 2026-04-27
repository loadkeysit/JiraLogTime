function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderIssueFields(fields) {
  const issueFields = document.getElementById("issueFields");
  if (!fields || Object.keys(fields).length === 0) {
    issueFields.innerHTML = "<div class='small'>Nessun campo Jira aggiuntivo rilevato.</div>";
    return;
  }

  const preferredOrder = [
    "Type",
    "Tipo",
    "Priority",
    "Priorità",
    "Resolution",
    "Component/s",
    "Components",
    "Labels",
    "Piattaforma",
    "Sotto Piattaforma",
    "Requested Service",
    "ASA",
    "Reparto del reporter",
    "Team del reporter",
    "Area Reparto",
    "Environment Type",
    "Dominio",
    "Server",
    "Casella",
    "Login (Servizio)"
  ];

  const ordered = [
    ...preferredOrder.filter((key) => key in fields),
    ...Object.keys(fields).filter((key) => !preferredOrder.includes(key))
  ].slice(0, 10);

  issueFields.innerHTML = ordered
    .map((key) => {
      const value = fields[key];
      return `<div><strong>${escapeHtml(key)}</strong>: ${escapeHtml(value || "")}</div>`;
    })
    .join("");
}

function renderHistory(logs) {
  const history = document.getElementById("history");
  if (!logs || logs.length === 0) {
    history.innerHTML = "<p class='small'>Nessun log salvato ancora.</p>";
    return;
  }

  history.innerHTML = logs
    .slice(-5)
    .reverse()
    .map((entry) => `
      <div class="entry">
        <strong>${escapeHtml(entry.issueKey)} ${escapeHtml(entry.issueSummary)}</strong>
        <div>${escapeHtml(entry.timeSpent)} - ${escapeHtml(new Date(entry.createdAt).toLocaleString())}</div>
        <div>${escapeHtml(entry.notes || "Nessuna nota")}</div>
      </div>`)
    .join("");
}

async function queryCurrentIssue() {
  const data = await browser.storage.local.get(["currentIssue", "logs"]);
  const issue = data.currentIssue || null;
  const saveButton = document.getElementById("saveButton");
  const issueText = document.getElementById("issueText");

  if (!issue) {
    issueText.textContent = "Nessuna issue Jira rilevata sulla pagina corrente.";
    saveButton.disabled = true;
    document.getElementById("issueFields").innerHTML = "<div class='small'>Apri una pagina Jira compatibile e premi Aggiorna.</div>";
  } else {
    issueText.textContent = `${issue.key} - ${issue.summary}`;
    saveButton.disabled = false;
    renderIssueFields(issue.fields || {});
  }

  renderHistory(data.logs || []);
}

async function saveLog() {
  const data = await browser.storage.local.get("currentIssue");
  const issue = data.currentIssue;
  if (!issue) {
    return;
  }

  const timeSpent = document.getElementById("timeSpent").value.trim();
  const notes = document.getElementById("notes").value.trim();
  if (!timeSpent) {
    alert("Inserisci il tempo speso prima di salvare.");
    return;
  }

  const entry = {
    createdAt: new Date().toISOString(),
    issueKey: issue.key,
    issueSummary: issue.summary,
    issueUrl: issue.url,
    timeSpent,
    notes,
    fieldsJson: JSON.stringify(issue.fields || {}),
  };

  const stored = await browser.storage.local.get("logs");
  const logs = stored.logs || [];
  logs.push(entry);
  await browser.storage.local.set({ logs });
  await downloadCsv(logs);
  document.getElementById("timeSpent").value = "";
  document.getElementById("notes").value = "";
  queryCurrentIssue();
}

function makeCsvLine(entry) {
  const escapeValue = (value) => `"${String(value).replace(/"/g, '""')}"`;
  return [
    escapeValue(entry.createdAt),
    escapeValue(entry.issueKey),
    escapeValue(entry.issueSummary),
    escapeValue(entry.timeSpent),
    escapeValue(entry.notes || ""),
    escapeValue(entry.issueUrl),
    escapeValue(entry.fieldsJson || "")
  ].join(",");
}

async function downloadCsv(logs) {
  if (!logs || logs.length === 0) {
    return;
  }

  const header = ["Timestamp", "Issue Key", "Summary", "Time Spent", "Notes", "Issue URL", "Fields"].join(",") + "\n";
  const rows = logs.map(makeCsvLine).join("\n") + "\n";
  const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  await browser.downloads.download({
    url,
    filename: "jira-time-log.csv",
    conflictAction: "overwrite",
    saveAs: false
  });
  URL.revokeObjectURL(url);
}

document.addEventListener("DOMContentLoaded", () => {
  queryCurrentIssue();
  document.getElementById("saveButton").addEventListener("click", saveLog);
  document.getElementById("refreshIssueButton").addEventListener("click", queryCurrentIssue);
});
