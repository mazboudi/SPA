/**
 * validateSchemas.js
 * Client-side JSON Schema validation using Ajv.
 * Validates wizard-generated files against the packaging-standards schemas.
 *
 * Schemas are imported statically so they're bundled by Vite at build time,
 * avoiding any runtime fetch from the filesystem.
 */
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

// Import schemas statically (Vite resolves these at build time)
import appSchema from '../../../schemas/packaging-standards/schemas/app.schema.json';
import intuneAppSchema from '../../../schemas/packaging-standards/schemas/intune-app.schema.json';
import intuneAssignmentsSchema from '../../../schemas/packaging-standards/schemas/intune-assignments.schema.json';
import intuneRequirementsSchema from '../../../schemas/packaging-standards/schemas/intune-requirements.schema.json';

// Map of generated file paths → their schema
const SCHEMA_MAP = {
  'app.json': appSchema,
  'windows/intune/app.json': intuneAppSchema,
  'windows/intune/assignments.json': intuneAssignmentsSchema,
  'windows/intune/requirements.json': intuneRequirementsSchema,
};

/**
 * Validate all generated JSON files that have a matching schema.
 * @param {Object} files - The file map from generateScaffolding ({ path: content })
 * @returns {Object[]} - Array of { file, valid, errors }
 */
export function validateGeneratedFiles(files) {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);

  const results = [];

  for (const [filePath, schema] of Object.entries(SCHEMA_MAP)) {
    const content = files[filePath];
    if (!content) continue; // file not generated (e.g. no windows platform)

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      results.push({ file: filePath, valid: false, errors: [`Invalid JSON: ${e.message}`] });
      continue;
    }

    const validate = ajv.compile(schema);
    const valid = validate(parsed);

    results.push({
      file: filePath,
      valid,
      errors: valid ? [] : validate.errors.map(e => {
        const path = e.instancePath || '/';
        return `${path}: ${e.message}${e.params?.allowedValues ? ` (allowed: ${e.params.allowedValues.join(', ')})` : ''}`;
      }),
    });
  }

  return results;
}
