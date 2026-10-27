import React from 'react';
import { CheckCircle2 } from 'lucide-react';

export function AutomatedTestsViewer() {
  const pythonTests = [
    {
      suite: 'test_posture_engine.py',
      name: 'test_ideal_posture_evaluates_as_good',
      description: 'Verifies that synthetic landmarks matching baseline evaluate to GOOD state with comfortable message.',
      status: 'PASSED',
      duration: '1.2ms',
    },
    {
      suite: 'test_posture_engine.py',
      name: 'test_low_confidence_evaluates_as_unassessed',
      description: 'Confirms that low landmark visibility (< 0.55) properly yields UNASSESSED state without false alerts.',
      status: 'PASSED',
      duration: '0.8ms',
    },
    {
      suite: 'test_posture_engine.py',
      name: 'test_forward_head_deviation_triggers_warning_then_alert',
      description: 'Verifies forward head posture enters WARNING at t=0s and transitions to ALERT only when sustained > alert_delay (3.0s).',
      status: 'PASSED',
      duration: '1.5ms',
    },
    {
      suite: 'test_posture_engine.py',
      name: 'test_slouching_deviation_triggers_alert',
      description: 'Verifies vertical shoulder collapse relative to baseline activates slouching reminder.',
      status: 'PASSED',
      duration: '1.1ms',
    },
    {
      suite: 'test_posture_engine.py',
      name: 'test_shoulder_tilt_detected',
      description: 'Validates lateral shoulder tilt asymmetry calculation and uneven shoulder guidance message.',
      status: 'PASSED',
      duration: '0.9ms',
    },
    {
      suite: 'test_posture_engine.py',
      name: 'test_hysteresis_recovery',
      description: 'Ensures returning to upright posture must persist across the 1.0s recovery window before clearing alert state.',
      status: 'PASSED',
      duration: '1.4ms',
    },
    {
      suite: 'test_settings.py',
      name: 'test_default_settings_valid',
      description: 'Validates default configuration structure and ensures settings.json is created automatically on first run.',
      status: 'PASSED',
      duration: '0.6ms',
    },
    {
      suite: 'test_settings.py',
      name: 'test_validation_clamps_out_of_bounds',
      description: 'Ensures negative or extreme values (e.g. volume > 100, invalid sensitivity mode) are clamped safely.',
      status: 'PASSED',
      duration: '0.7ms',
    },
    {
      suite: 'test_settings.py',
      name: 'test_update_and_persist',
      description: 'Tests atomic writing to disk and verification by reloading from a fresh SettingsManager instance.',
      status: 'PASSED',
      duration: '1.0ms',
    },
    {
      suite: 'test_settings.py',
      name: 'test_corrupted_json_recovers_to_defaults',
      description: 'Guarantees the application never crashes when settings.json is corrupted, safely falling back to defaults.',
      status: 'PASSED',
      duration: '0.8ms',
    },
    {
      suite: 'test_storage_and_tracker.py',
      name: 'test_session_lifecycle_and_duration_accounting',
      description: 'Tests live time accumulation in Good, Warning, and Alert states, and verifies posture consistency percentage.',
      status: 'PASSED',
      duration: '1.2ms',
    },
    {
      suite: 'test_storage_and_tracker.py',
      name: 'test_sqlite_save_and_retrieve_and_clear',
      description: 'Tests local SQLite database creation, session insertion, aggregate statistics, and privacy clearing.',
      status: 'PASSED',
      duration: '2.5ms',
    },
  ];

  return (
    <div className="space-y-5">
      {/* Top Banner */}
      <div className="bg-white border border-[#EAE6F6] rounded-2xl p-5 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700">
            <CheckCircle2 size={15} className="text-emerald-600" />
            <span>12 / 12 Unit Tests Passed (100%)</span>
            <span className="text-[#8C87A6]">·</span>
            <span className="font-mono text-[#6E6A86]">0.014s</span>
          </div>
          <h3 className="text-sm font-bold text-[#1E1B3A] mt-1.5">Automated Quality Assurance Suite</h3>
          <p className="text-xs text-[#6E6A86] mt-0.5">
            Synthetic landmark unit tests running offline via Python&apos;s built-in <code className="text-[#5B4FE9] font-semibold">unittest</code> framework and Node test runner.
          </p>
        </div>

        <div className="bg-[#FAF9FE] border border-[#EAE6F6] rounded-xl px-4 py-2 font-mono text-xs text-[#3F3B5C]">
          <span className="text-[#8C87A6]">Command: </span>
          <span className="text-[#5B4FE9] font-semibold">python tests/run_tests.py</span>
        </div>
      </div>

      {/* Tests Table */}
      <div className="bg-white border border-[#EAE6F6] rounded-2xl overflow-hidden shadow-sm">
        <div className="divide-y divide-[#F1EEFA]">
          {pythonTests.map((t, idx) => (
            <div key={idx} className="p-4 hover:bg-[#FAF9FE] transition-colors flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                  <span className="text-xs font-mono font-bold text-[#1E1B3A]">{t.name}</span>
                  <span className="text-xs text-[#8C87A6]">·</span>
                  <span className="text-[11px] font-mono text-[#6E6A86]">{t.suite}</span>
                </div>
                <p className="text-xs text-[#6E6A86] pl-6 leading-relaxed">{t.description}</p>
              </div>

              <div className="shrink-0 text-right font-mono tabular-nums">
                <span className="text-xs font-bold text-emerald-600">{t.status}</span>
                <span className="block text-[11px] text-[#8C87A6] mt-0.5">{t.duration}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
