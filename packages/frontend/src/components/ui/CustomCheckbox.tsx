import { FaCheck } from "react-icons/fa";

interface CustomCheckboxProps {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}

export function CustomCheckbox({
  checked,
  onChange,
  disabled = false,
}: CustomCheckboxProps) {
  return (
    <label className="relative inline-flex items-center cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="sr-only"
      />
      <div
        className={`flex h-4 w-4 items-center justify-center rounded border-2 transition-all ${
          checked ? "border-primary bg-primary" : "border-input bg-background"
        } ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"} ${
          !disabled && !checked ? "hover:border-primary/60" : ""
        }`}
      >
        {checked && <FaCheck className="h-3 w-3 text-primary-foreground" />}
      </div>
    </label>
  );
}
