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
        className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${
          checked
            ? "bg-blue-600 dark:bg-blue-500 border-blue-600 dark:border-blue-500"
            : "bg-white dark:bg-[#1e1e1e] border-gray-300 dark:border-[#3d3d3d]"
        } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"} ${
          !disabled && !checked
            ? "hover:border-blue-400 dark:hover:border-blue-600"
            : ""
        }`}
      >
        {checked && <FaCheck className="w-3 h-3 text-white" />}
      </div>
    </label>
  );
}
