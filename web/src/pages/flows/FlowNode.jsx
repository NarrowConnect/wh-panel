import React, { createContext, memo, useContext } from 'react';
import { Handle, Position, BaseEdge, EdgeLabelRenderer, getBezierPath, useInternalNode, useReactFlow } from '@xyflow/react';
import { AlertTriangle, X } from 'lucide-react';
import { NODE_SPECS, TONES, summarize } from './catalog';

/**
 * Lookups (queues, stages...) and run-time overlays (problems, conversations
 * parked on a step) reach the nodes through context so editing one node never
 * forces the others to re-render with new data objects.
 */
export const CanvasContext = createContext({
  lookups: {},
  problems: {},
  warnings: {},
  parked: {},
  focusId: null,
});

export const StepNode = memo(({ id, type, data, selected }) => {
  const { lookups, problems, warnings, parked, focusId } = useContext(CanvasContext);
  const spec = NODE_SPECS[type] || NODE_SPECS.send_message;
  const tone = TONES[spec.tone];
  const Icon = spec.icon;
  const summary = summarize(type, data.config, lookups);
  const issues = problems[id];
  const warning = warnings[id];
  const waiting = parked[id] || 0;
  const labeled = spec.outputs.length > 1 || spec.outputs.some((o) => o.label);
  const isTrigger = type === 'trigger';

  return (
    <div
      className={`flow-node group relative rounded-xl border bg-[#15161b] text-left transition-[border-color,box-shadow] duration-150 ${
        selected
          ? 'border-accent-400/70 shadow-[0_0_0_3px_rgba(116,104,189,0.18),0_12px_32px_-14px_rgba(0,0,0,0.8)]'
          : focusId === id
            ? 'border-amber-400/60 shadow-[0_0_0_3px_rgba(217,176,106,0.16)]'
            : 'border-white/[0.09] hover:border-white/[0.18] shadow-[0_12px_32px_-18px_rgba(0,0,0,0.9)]'
      }`}
      style={{ width: 264 }}
    >
      {!isTrigger && <Handle type="target" position={Position.Left} className="flow-handle flow-handle-in" />}

      <div className="flex items-start gap-2.5 px-3 pt-3 pb-2.5">
        <span className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${tone.chip}`}>
          <Icon className="w-3.5 h-3.5" strokeWidth={1.9} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] leading-5 font-medium text-white truncate">{data.title || spec.label}</p>
          <p className="text-[11px] leading-4 text-slate-500 truncate">{spec.label}</p>
        </div>
        <div className="flex items-center gap-1 pt-0.5">
          {waiting > 0 && (
            <span
              className="h-5 px-1.5 inline-flex items-center gap-1 rounded-md bg-amber-500/10 text-[11px] text-amber-300 tabular-nums"
              title={`${waiting} ${waiting === 1 ? 'conversa parada' : 'conversas paradas'} nesta etapa`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-300 animate-pulse" />
              {waiting}
            </span>
          )}
          {issues?.length > 0 && (
            <span className="w-5 h-5 inline-flex items-center justify-center rounded-md text-amber-300" title={issues.join('\n')}>
              <AlertTriangle className="w-3.5 h-3.5" strokeWidth={1.9} />
              <span className="sr-only">{issues.join('. ')}</span>
            </span>
          )}
        </div>
      </div>

      <div className="px-3 pb-3">
        {summary ? (
          <p className="text-xs leading-[1.45] text-slate-300/80 line-clamp-2 break-words">{summary}</p>
        ) : (
          <p className="text-xs leading-[1.45] text-slate-500">Clique para configurar</p>
        )}
        {warning && !issues && <p className="mt-1.5 text-[11px] text-slate-500">{warning}</p>}
      </div>

      {labeled ? (
        <div className="border-t border-white/[0.06] py-1">
          {spec.outputs.map((out) => (
            <div key={out.id} className="relative flex items-center justify-end gap-2 h-7 pr-4 pl-3">
              <span className="text-[11px] text-slate-400">{out.label}</span>
              <Handle
                type="source"
                id={out.id}
                position={Position.Right}
                className="flow-handle"
                style={{ '--handle-color': out.color }}
              />
            </div>
          ))}
        </div>
      ) : (
        spec.outputs[0] && (
          <Handle
            type="source"
            id={spec.outputs[0].id}
            position={Position.Right}
            className="flow-handle"
            style={{ '--handle-color': isTrigger ? tone.dot : spec.outputs[0].color }}
          />
        )
      )}
    </div>
  );
});

StepNode.displayName = 'StepNode';

export const nodeTypes = Object.fromEntries(Object.keys(NODE_SPECS).map((t) => [t, StepNode]));

const edgeColorFor = (sourceType, handle) => {
  const outs = NODE_SPECS[sourceType]?.outputs || [];
  if (outs.length < 2) return null;
  return outs.find((o) => o.id === handle)?.color || null;
};

export const StepEdge = memo(({ id, source, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, sourceHandleId, selected, markerEnd }) => {
  const sourceNode = useInternalNode(source);
  const { deleteElements } = useReactFlow();
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, curvature: 0.35 });
  const color = edgeColorFor(sourceNode?.type, sourceHandleId);

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        interactionWidth={24}
        style={{
          stroke: selected ? '#958bd0' : color || 'rgba(255,255,255,0.22)',
          strokeOpacity: selected ? 1 : color ? 0.7 : 1,
          strokeWidth: selected ? 2 : 1.5,
        }}
      />
      {selected && (
        <EdgeLabelRenderer>
          <button
            type="button"
            onClick={() => deleteElements({ edges: [{ id }] })}
            className="nodrag nopan absolute w-6 h-6 rounded-full bg-[#1b1c22] border border-white/[0.14] text-slate-300 hover:text-rose-300 hover:border-rose-400/40 flex items-center justify-center"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, pointerEvents: 'all' }}
            aria-label="Remover conexão"
            title="Remover conexão"
          >
            <X className="w-3 h-3" strokeWidth={2} />
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
});

StepEdge.displayName = 'StepEdge';

export const edgeTypes = { step: StepEdge };
