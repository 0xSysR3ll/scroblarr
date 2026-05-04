interface CustomRadioProps {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  name?: string;
  value?: string;
}

export function CustomRadio({
  checked,
  onChange,
  disabled = false,
  name,
  value,
}: CustomRadioProps) {
  return (
    <label className="relative inline-flex items-center cursor-pointer">
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="sr-only"
      />
      <div
        className={`flex h-4 w-4 items-center justify-center rounded-full border-2 transition-all ${
          checked ? "border-primary bg-primary" : "border-input bg-background"
        } ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"} ${
          !disabled && !checked ? "hover:border-primary/60" : ""
        }`}
      >
        {checked && (
          <div className="h-2 w-2 rounded-full bg-primary-foreground"></div>
        )}
      </div>
    </label>
  );
}
