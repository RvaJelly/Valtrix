import { TextField } from '@/components/ui';
import { currencySymbol } from '@/lib/money';

// A price typed as text ("400", "450.50"), with the currency's symbol in front. The caller parses it
// with parseMoney and passes the sentence back as `error`.
export function PriceField({
  label,
  value,
  onChangeText,
  currency,
  error,
  placeholder,
  optional,
  testID,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  currency: string;
  error?: string | null;
  placeholder?: string;
  optional?: boolean;
  testID?: string;
}) {
  return (
    <TextField
      label={label}
      value={value}
      onChangeText={onChangeText}
      prefix={currencySymbol(currency)}
      keyboardType="decimal-pad"
      inputMode="decimal"
      placeholder={placeholder}
      optional={optional}
      maxLength={12}
      error={error}
      testID={testID}
    />
  );
}
