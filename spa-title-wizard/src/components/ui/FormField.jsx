export default function FormField({ label, hint, error, required, children, id }) {
  return (
    <div className="form-field">
      {label && (
        <label htmlFor={id}>
          {label}
          {required && <span className="form-field__required">*</span>}
        </label>
      )}
      {children}
      {hint && <p className="form-field__hint">{hint}</p>}
      {error && <p className="form-field__error">{error}</p>}

      <style>{`
        .form-field {
          margin-bottom: var(--space-md);
        }
        .form-field__required {
          color: var(--color-error);
          margin-left: 3px;
        }
        .form-field__hint {
          font-size: 0.75rem;
          color: var(--text-muted);
          margin-top: var(--space-xs);
        }
        .form-field__error {
          font-size: 0.75rem;
          color: var(--color-error);
          margin-top: var(--space-xs);
        }
      `}</style>
    </div>
  );
}
