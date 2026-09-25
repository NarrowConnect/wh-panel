import React from 'react';

/*
 * The app Header already carries the page title, so pages open with this
 * quiet row instead of a hero card: one line of context on the left, the
 * page's actions on the right. `children` sits under the description for
 * view switches or filters that belong to the whole page.
 */
export const PageHeader = ({ description, actions, children }) => (
  <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
    <div className="min-w-0 space-y-3">
      {description && <p className="text-[13px] leading-relaxed text-slate-400 max-w-2xl">{description}</p>}
      {children}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2 xl:flex-nowrap xl:flex-shrink-0">{actions}</div>}
  </div>
);

export default PageHeader;
