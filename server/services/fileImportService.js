import { parse } from 'csv-parse/sync';

const MAX_IMPORT_RECORDS = 5000;

export function parseImportFile({ format, content }) {
  const normalizedFormat = String(format || '').toLowerCase().replace(/^\./, '');
  if (typeof content !== 'string' || content.trim() === '') {
    throw new Error('The selected file is empty.');
  }

  let records;
  if (normalizedFormat === 'json') {
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      throw new Error(`Invalid JSON: ${error.message}`);
    }
    records = Array.isArray(parsed) ? parsed : parsed?.records;
    if (!Array.isArray(records)) {
      throw new Error('JSON must be an array of study records or an object containing a records array.');
    }
  } else if (normalizedFormat === 'csv') {
    try {
      records = parse(content, {
        bom: true,
        columns: true,
        skip_empty_lines: true,
        trim: true
      });
    } catch (error) {
      throw new Error(`Invalid CSV: ${error.message}`);
    }
  } else {
    throw new Error('Unsupported file format. Upload a .csv or .json file.');
  }

  if (!records.length) throw new Error('The file contains no data records.');
  if (records.length > MAX_IMPORT_RECORDS) {
    throw new Error(`The file contains ${records.length} records; the maximum per import is ${MAX_IMPORT_RECORDS}.`);
  }
  if (records.some((record) => !record || typeof record !== 'object' || Array.isArray(record))) {
    throw new Error('Every file record must be a JSON object or CSV row.');
  }

  return records;
}
