// @file: ReviewPackageWidget — editable checkbox action package with per-action outcomes.
// @consumers: MrWorkspace
// @tasks: TSK-182

import { useEffect, useState } from 'react';
import { dashboardV2Api } from '../dashboard-v2-api.ts';
import type { ReviewPackage, ReviewPackageAction } from '../v2-types.ts';

/**
 * @purpose Editable checkbox action package: recommended actions pre-selected, apply is immediate, per-action outcomes visible.
 * @invariant Stale package remains visible with disabled controls, staleReason, and verificationRef link.
 * @invariant Apply is immediate for non-fatal GitLab writes; each action outcome updates independently.
 * @param props Active MR reference.
 */
export function ReviewPackageWidget(props: { mrRef: string }) {
  const { mrRef } = props;
  const [pkg, setPkg] = useState<ReviewPackage | null>(null);
  const [selections, setSelections] = useState<Record<string, boolean>>({});
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<Record<string, 'success' | 'error'>>({});

  useEffect(() => {
    // #region START_PACKAGE_FETCH — failure mode: stays null, shows error inline
    dashboardV2Api
      .package(mrRef)
      .then((loaded) => {
        setPkg(loaded);
        const initial: Record<string, boolean> = {};
        for (const action of loaded.actions) {
          initial[action.id] = action.selected;
        }
        setSelections(initial);
      })
      .catch(() => setPkg(null));
    // #endregion END_PACKAGE_FETCH
  }, [mrRef]);

  const toggleAction = (actionId: string): void => {
    if (pkg?.stale) return;
    setSelections((prev) => ({ ...prev, [actionId]: !prev[actionId] }));
  };

  const applySelected = async (): Promise<void> => {
    if (!pkg || pkg.stale) return;
    const selectedActionIds = Object.entries(selections)
      .filter(([, selected]) => selected)
      .map(([id]) => id);
    if (selectedActionIds.length === 0) return;

    setApplying(true);
    setApplyError(null);
    setOutcomes({});

    // #region START_PACKAGE_APPLY — invariant: apply is immediate; per-action outcomes set individually from server response
    try {
      const result = await dashboardV2Api.applyPackage(mrRef, pkg.packageId, selectedActionIds);
      setOutcomes(result.outcomes);
    } catch {
      setApplyError('Не удалось применить пакет — повторите попытку');
    } finally {
      setApplying(false);
    }
    // #endregion END_PACKAGE_APPLY
  };

  const resolveOutcomeLabel = (action: ReviewPackageAction): string => {
    const liveOutcome = outcomes[action.id];
    if (liveOutcome === 'success') return '✔';
    if (liveOutcome === 'error') return '✘';
    if (action.outcome === 'success') return '✔';
    if (action.outcome === 'error') return '✘';
    if (action.outcome === 'skipped') return '—';
    return '';
  };

  if (!pkg) {
    return (
      <section className="v2-package" aria-label="Пакет действий">
        <p className="v2-muted">Пакет действий загружается…</p>
      </section>
    );
  }

  return (
    <section className="v2-package" aria-label="Пакет действий">
      <header className="v2-package-header">
        <h3>Пакет действий</h3>
        {pkg.stale && (
          <span className="v2-package-stale" role="status">
            ⚠ Устарел: {pkg.staleReason ?? ''}
            {pkg.verificationRef && <> — верификация: {pkg.verificationRef}</>}
          </span>
        )}
      </header>

      <ul className="v2-package-actions">
        {pkg.actions.map((action) => {
          const outcomeLabel = resolveOutcomeLabel(action);
          return (
            <li key={action.id} className="v2-package-action">
              <label className="v2-package-action-label">
                <input
                  type="checkbox"
                  checked={selections[action.id] ?? false}
                  disabled={pkg.stale || applying}
                  onChange={() => toggleAction(action.id)}
                  aria-label={action.label}
                />
                <span className="v2-package-action-text">
                  <b>{action.label}</b>
                  <span className="v2-muted">{action.description}</span>
                </span>
                {outcomeLabel && (
                  <span
                    className={`v2-package-outcome${outcomeLabel === '✔' ? ' ok' : ' err'}`}
                    aria-label={
                      outcomeLabel === '✔'
                        ? 'Успешно'
                        : outcomeLabel === '✘'
                          ? 'Ошибка'
                          : 'Пропущено'
                    }
                  >
                    {outcomeLabel}
                  </span>
                )}
                {outcomes[action.id] === 'error' && (
                  <span className="v2-package-action-error" role="alert">
                    {action.errorMessage ?? 'Ошибка применения'}
                  </span>
                )}
              </label>
            </li>
          );
        })}
      </ul>

      {applyError && (
        <p className="v2-error" role="alert">
          {applyError}
        </p>
      )}

      <div className="v2-package-footer">
        <button
          disabled={applying || pkg.stale}
          onClick={() => void applySelected()}
          className="v2-package-apply"
          aria-label="Применить выбранные действия"
        >
          {applying ? '⏳ Применяю…' : 'Применить'}
        </button>
      </div>
    </section>
  );
}
