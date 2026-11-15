import type { Source } from "../model";
import { NumberField } from "./NumberField";
import { PulseField } from "./PulseField";
import { t } from "../i18n";

interface Props {
  sources: Source[];
  onChange: (sources: Source[]) => void;
}

/** The sources, as in MMANA: the place, the phase in degrees and the voltage. A model keeps at least one. */
export function SourceTable({ sources, onChange }: Props) {
  const replace = (index: number, source: Source) => onChange(sources.map((one, i) => (i === index ? source : one)));
  const add = () => onChange([...sources, { at: { wire: 0, place: "c" }, phase: 0, voltage: 1 }]);

  return (
    <div className="loads">
      {sources.map((source, index) => (
        <div className="load" key={index}>
          <span className="index">{index + 1}</span>
          <PulseField label={t("Місце")} value={source.at} onChange={(at) => replace(index, { ...source, at })} />
          <NumberField
            label={t("Фаза, °")}
            help="sourcePhase"
            value={source.phase}
            onChange={(phase) => replace(index, { ...source, phase })}
          />
          <NumberField label={t("Напруга, В")} help="sourceVoltage" value={source.voltage} onChange={(voltage) => replace(index, { ...source, voltage })} />
          <button
            type="button"
            className="quiet remove"
            aria-label={t("Вилучити джерело {n}", { n: index + 1 })}
            disabled={sources.length === 1}
            onClick={() => onChange(sources.filter((_, i) => i !== index))}
          >
            ×
          </button>
        </div>
      ))}
      <button type="button" onClick={add}>
        {t("Додати джерело")}
      </button>
    </div>
  );
}
