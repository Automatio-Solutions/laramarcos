interface FieldProps {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string | null;
  required?: boolean;
  error?: string;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  placeholder?: string;
}

export function Field({
  label,
  name,
  type = "text",
  defaultValue,
  required,
  error,
  onBlur,
  placeholder,
}: FieldProps) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-fg">
        {label}
        {required && <span className="text-error"> *</span>}
      </span>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue ?? undefined}
        onBlur={onBlur}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        className={`w-full rounded-md border bg-surface px-3 py-2 text-fg outline-none focus:border-primary ${
          error ? "border-error" : "border-border"
        }`}
      />
      {error && (
        <span className="block text-xs text-error" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}
