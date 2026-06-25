import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import PholioButton from '../../../shared/components/ui/PholioButton';
import './CompCardGate.css';

const ARRIVE = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
};

const GROUP_ORDER = ['Identity', 'Measurements', 'Photos', 'Profile'];

function groupTasks(tasks) {
  const buckets = tasks.reduce((acc, task) => {
    const group = task.group || 'Profile';
    if (!acc[group]) acc[group] = [];
    acc[group].push(task);
    return acc;
  }, {});

  return GROUP_ORDER.filter((name) => buckets[name]?.length).map((name) => ({
    name,
    items: buckets[name],
  }));
}

export default function CompCardGate({
  missingTasks = [],
  missingFields = [],
  completedCount = 0,
  totalRequired = 8,
}) {
  const whyByKey = React.useMemo(() => {
    const map = {};
    for (const field of missingFields) {
      if (field?.key) map[field.key] = field.why;
    }
    return map;
  }, [missingFields]);

  const tasks = missingTasks.slice(0, 6);
  const groups = groupTasks(tasks);
  const primary = tasks[0];
  const progressPct = totalRequired > 0 ? Math.round((completedCount / totalRequired) * 100) : 0;

  return (
    <motion.div className="cc-gate" {...ARRIVE} role="region" aria-label="Comp card requirements">
      <header className="cc-gate__head">
        <div className="cc-gate__headcopy">
          <h2 className="mw-h2">Comp card</h2>
          <p className="mw-sub">
            When your submission package is complete, Pholio composes a two-sided 5.5 × 8.5 card from your book — always current.
          </p>
        </div>
        <p className="cc-gate__status" aria-live="polite">
          {completedCount} of {totalRequired} essentials
        </p>
      </header>

      <div className="cc-gate__stage">
        <div className="cc-gate__showcase">
          <div className="cc-gate__phantom" aria-hidden="true">
            <div className="cc-gate__phantom-inner">
              <span className="cc-gate__phantom-ratio">5.5 × 8.5</span>
            </div>
          </div>
          <p className="cc-gate__phantom-caption">Composes from your frames above</p>
        </div>

        <aside className="cc-gate__aside">
          <div className="cc-gate__aside-head">
            <h3 className="cc-gate__aside-title">Before composition</h3>
            <div className="cc-gate__meter" aria-hidden="true">
              <div className="cc-gate__meter-track">
                <motion.div
                  className="cc-gate__meter-fill"
                  initial={false}
                  animate={{ width: `${progressPct}%` }}
                  transition={{ type: 'spring', stiffness: 55, damping: 16 }}
                />
              </div>
              <span className="cc-gate__meter-label">{progressPct}%</span>
            </div>
          </div>

          <p className="cc-gate__aside-lead">
            {tasks.length === 1
              ? 'One essential remains before your card can be composed.'
              : `${tasks.length} essentials remain before your card can be composed.`}
          </p>

          {groups.length > 0 ? (
            <div className="cc-gate__groups">
              {groups.map((group) => (
                <section key={group.name} className="cc-gate__group">
                  <h4 className="cc-gate__group-label">{group.name}</h4>
                  <ol className="cc-gate__list">
                    {group.items.map((task) => (
                      <li key={task.key || task.label}>
                        <Link
                          to={task.href || '/dashboard/talent/profile?gate=true'}
                          className="cc-gate__item"
                        >
                          <span className="cc-gate__item-copy">
                            <span className="cc-gate__item-label">{task.label}</span>
                            {whyByKey[task.key] ? (
                              <span className="cc-gate__item-why">{whyByKey[task.key]}</span>
                            ) : null}
                          </span>
                          <ArrowUpRight size={15} className="cc-gate__item-icon" aria-hidden="true" />
                        </Link>
                      </li>
                    ))}
                  </ol>
                </section>
              ))}
            </div>
          ) : null}

          <div className="cc-gate__actions">
            {primary ? (
              <PholioButton
                to={primary.href || '/dashboard/talent/profile?gate=true'}
                variant="solid"
                fullWidth
              >
                {primary.task || `Complete ${primary.label}`}
              </PholioButton>
            ) : null}
            <Link to="/dashboard/talent/profile?gate=true" className="cc-gate__secondary">
              Open profile
            </Link>
          </div>
        </aside>
      </div>
    </motion.div>
  );
}
