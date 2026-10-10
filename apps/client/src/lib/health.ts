// The health form, the same file in Voltrix and Voltrix Coach. The questions and the "needs a doctor"
// rule live in the database (health_questions, health_forms.needs_doctor); this file only reads the
// answers back. Pure: no runtime imports, so the unit checks can load it as it is.

export type HealthQuestion = { key: string; position: number; question: string };

export type HealthForm = {
  version: number;
  answers: Record<string, boolean>;
  details: string | null;
  emergency_name: string | null;
  emergency_phone: string | null;
  signed_name: string;
  needs_doctor: boolean;
  signed_at: string;
  created_at: string;
  updated_at: string;
};

// Every question has a yes or a no.
export function allAnswered(answers: Record<string, boolean | null | undefined>, qs: HealthQuestion[]): boolean {
  return qs.length > 0 && qs.every((q) => typeof answers[q.key] === 'boolean');
}

// The questions answered yes, by key.
export function yesKeys(form: Pick<HealthForm, 'answers'>): string[] {
  return Object.keys(form.answers ?? {}).filter((key) => form.answers[key] === true);
}

// The database's rule: a yes asks for a doctor's OK, which counts when it is dated on or after the
// day the form was signed (the trainer's day; the caller passes it as 'YYYY-MM-DD').
export function healthState(
  form: Pick<HealthForm, 'needs_doctor'>,
  signedDay: string,
  okOn: string | null,
): 'clear' | 'doctor' | 'doctor_ok' {
  if (!form.needs_doctor) return 'clear';
  return okOn && okOn >= signedDay ? 'doctor_ok' : 'doctor';
}
