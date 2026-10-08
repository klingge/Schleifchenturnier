import { useId, useState } from "react";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { validRoundPlan } from "@/domain/event-rules";

export function RoundPlanFields({
  value,
  onChange,
  completedRounds = 0,
  disabled = false,
}: {
  value: number | null;
  onChange(value: number | null): void;
  completedRounds?: number;
  disabled?: boolean;
}) {
  const id = useId();
  const [countTouched, setCountTouched] = useState(false);
  const valid = validRoundPlan(value, completedRounds);
  const showInvalid = value !== null && countTouched && !valid;
  return (
    <>
      <Field data-disabled={disabled}>
        <FieldLabel id={`${id}-label`}>Turnierdauer</FieldLabel>
        <ToggleGroup
          type="single"
          variant="outline"
          value={value === null ? "manual" : "fixed"}
          aria-labelledby={`${id}-label`}
          disabled={disabled}
          className="w-full flex-wrap"
          onValueChange={(mode) => {
            if (mode === "manual") {
              setCountTouched(false);
              onChange(null);
            }
            if (mode === "fixed" && value === null) {
              setCountTouched(false);
              onChange(NaN);
            }
          }}
        >
          <ToggleGroupItem value="manual" className="flex-1 basis-32">
            Selbst beenden
          </ToggleGroupItem>
          <ToggleGroupItem value="fixed" className="flex-1 basis-36">
            Feste Rundenanzahl
          </ToggleGroupItem>
        </ToggleGroup>
        {value === null && (
          <FieldDescription>
            Du beendest das Turnier nach einer abgeschlossenen Runde.
          </FieldDescription>
        )}
      </Field>
      {value !== null && (
        <Field data-invalid={showInvalid} data-disabled={disabled}>
          <FieldLabel htmlFor={id}>Runden insgesamt</FieldLabel>
          <Input
            id={id}
            type="number"
            inputMode="numeric"
            min={completedRounds + 1}
            step={1}
            value={Number.isNaN(value) ? "" : value}
            required
            disabled={disabled}
            aria-invalid={showInvalid}
            aria-describedby={`${id}-help`}
            onBlur={() => setCountTouched(true)}
            onChange={(e) => {
              setCountTouched(true);
              onChange(e.target.value === "" ? NaN : Number(e.target.value));
            }}
          />
          <FieldDescription id={`${id}-help`}>
            {completedRounds > 0
              ? `${completedRounds} ${completedRounds === 1 ? "Runde" : "Runden"} abgeschlossen. Plane mindestens ${completedRounds + 1} Runden insgesamt.`
              : "Nach Abschluss der letzten Runde endet das Turnier automatisch."}
          </FieldDescription>
        </Field>
      )}
    </>
  );
}
