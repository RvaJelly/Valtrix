import { TextField } from '@/components/ui';
import { currencySymbol, moneyInput, parseMoney } from '@/lib/money';

// A price typed as text ("400", "450.50"), with the currency's symbol in front. The caller parses it
// with parseMoney and passes the sentence back as `error`. Leaving the field groups the thousands
// ("2000" reads "2 000"), as every other amount does.
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
      onBlur={() => {
        const { cents, error: problem } = parseMoney(value, currency);
        const grouped = cents == null || problem ? value : moneyInput(cents);
        if (grouped !== value) onChangeText(grouped);
      }}
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
