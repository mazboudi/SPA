import FormField from './FormField';

export default function SelectField({ label, hint, required, id, value, onChange, options, placeholder, disabled }) {
  return (
    <FormField label={label} hint={hint} required={required} id={id}>
      <select id={id} value={value} onChange={e => onChange(e.target.value)} disabled={disabled} className={disabled ? 'input-disabled' : ''}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </FormField>
  );
}
