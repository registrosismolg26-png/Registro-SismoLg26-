import { useState, useRef, useEffect } from "react";

interface CustomSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  required?: boolean;
  hasError?: boolean;
}

export default function CustomSelect({
  label,
  value,
  onChange,
  options,
  placeholder = "Seleccione una opción...",
  required = false,
  hasError = false
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <div className="form-group" ref={containerRef} style={{ position: "relative" }}>
      {label && (
        <label style={{ display: "block", marginBottom: "0.375rem" }}>
          {label}
          {required && <span className="required-star">*</span>}
        </label>
      )}
      
      {/* Trigger Button */}
      <div 
        className={`custom-select-trigger ${isOpen ? "open" : ""} ${hasError ? "has-error" : ""}`}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setIsOpen(!isOpen);
          }
        }}
        tabIndex={0}
        role="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span>{value || placeholder}</span>
        <span className="arrow-icon">▼</span>
      </div>

      {/* Options Dropdown */}
      {isOpen && (
        <ul 
          className="custom-select-options"
          role="listbox"
        >
          {options.map((option) => (
            <li 
              key={option} 
              className={`custom-select-option ${value === option ? "selected" : ""}`}
              role="option"
              aria-selected={value === option}
              onClick={() => {
                onChange(option);
                setIsOpen(false);
              }}
            >
              {option}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
