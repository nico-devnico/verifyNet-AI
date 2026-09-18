/** Export de données vers un fichier téléchargé par le navigateur. */

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function stamp() {
  return new Date().toISOString().slice(0, 10);
}

export function exportJson(rows, basename) {
  download(
    new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json;charset=utf-8' }),
    `${basename}_${stamp()}.json`
  );
}

/**
 * Export CSV.
 *
 * Le BOM UTF-8 en tête est nécessaire pour qu'Excel affiche correctement les
 * accents, et le séparateur point-virgule correspond aux paramètres régionaux
 * français.
 */
export function exportCsv(rows, basename, columns) {
  if (!rows?.length) return;

  const keys = columns || Object.keys(rows[0]);

  const escape = (value) => {
    if (value === null || value === undefined) return '';
    const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const csv = [
    keys.join(';'),
    ...rows.map((row) => keys.map((k) => escape(row[k])).join(';')),
  ].join('\r\n');

  download(
    new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }),
    `${basename}_${stamp()}.csv`
  );
}
