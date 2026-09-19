'use client';

import React, { useState, useMemo, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  type Node,
  type Edge,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Building2,
  Landmark,
  ArrowUpRight,
  ArrowDownLeft,
  ShieldCheck,
  Info,
  Layers,
  FileText,
} from 'lucide-react';
import type { BankStatementDoc, BillInvoiceDoc } from '@/app/api/ingestion/documents/route';

interface EntityGraphViewProps {
  businessName?: string;
  bankStatements: BankStatementDoc[];
  billsAndInvoices: BillInvoiceDoc[];
}

// ---------------------------------------------------------------------------
// Custom Node Components
// ---------------------------------------------------------------------------

function BusinessNode({ data }: NodeProps) {
  return (
    <div className="bg-neutral-900 text-white p-4 border border-neutral-800 shadow-sm min-w-[200px] text-xs font-sans">
      <Handle type="source" position={Position.Top} className="!bg-neutral-400 !w-2 !h-2" />
      <Handle type="source" position={Position.Bottom} className="!bg-neutral-400 !w-2 !h-2" />
      <Handle type="source" position={Position.Left} className="!bg-neutral-400 !w-2 !h-2" />
      <Handle type="source" position={Position.Right} className="!bg-neutral-400 !w-2 !h-2" />

      <div className="flex items-center space-x-2 pb-2 border-b border-neutral-800">
        <Building2 size={15} className="text-emerald-400 shrink-0" />
        <span className="font-bold text-xs truncate">{data.label as string}</span>
      </div>

      <div className="mt-2 text-[10px] text-neutral-400 flex items-center justify-between">
        <span>Headquarters</span>
        <span className="text-emerald-400 font-semibold">Active</span>
      </div>
    </div>
  );
}

function BankNode({ data }: NodeProps) {
  const isSelected = data.isSelected;
  return (
    <div
      className={`bg-white p-3.5 border transition-all text-xs font-sans min-w-[190px] ${
        isSelected ? 'border-sky-600 ring-2 ring-sky-100 shadow-md' : 'border-neutral-200 hover:border-neutral-400'
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-sky-500 !w-2 !h-2" />
      <Handle type="target" position={Position.Bottom} className="!bg-sky-500 !w-2 !h-2" />
      <Handle type="target" position={Position.Left} className="!bg-sky-500 !w-2 !h-2" />
      <Handle type="target" position={Position.Right} className="!bg-sky-500 !w-2 !h-2" />

      <div className="flex items-center justify-between pb-1.5 border-b border-neutral-100">
        <div className="flex items-center space-x-1.5 truncate">
          <Landmark size={14} className="text-sky-600 shrink-0" />
          <span className="font-bold text-neutral-900 text-xs truncate">{data.label as string}</span>
        </div>
        <span className="text-[10px] font-mono text-neutral-400">{data.accountMasked as string}</span>
      </div>

      <div className="mt-2">
        <span className="text-[10px] text-neutral-400 block uppercase tracking-wider">Balance</span>
        <div className="font-display font-bold text-sm text-neutral-900 mt-0.5">
          ₹{(data.amount as number).toLocaleString('en-IN')}
        </div>
      </div>
    </div>
  );
}

function CounterpartyNode({ data }: NodeProps) {
  const isSelected = data.isSelected;
  const isCustomer = data.entityType === 'CUSTOMER';
  const isTax = data.entityType === 'TAX';

  const typeColor = isCustomer
    ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
    : isTax
    ? 'text-purple-700 bg-purple-50 border-purple-200'
    : 'text-amber-800 bg-amber-50 border-amber-200';

  return (
    <div
      className={`bg-white p-3.5 border transition-all text-xs font-sans min-w-[200px] ${
        isSelected ? 'border-neutral-900 ring-2 ring-neutral-200 shadow-md' : 'border-neutral-200 hover:border-neutral-400'
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-neutral-500 !w-2 !h-2" />
      <Handle type="target" position={Position.Bottom} className="!bg-neutral-500 !w-2 !h-2" />
      <Handle type="target" position={Position.Left} className="!bg-neutral-500 !w-2 !h-2" />
      <Handle type="target" position={Position.Right} className="!bg-neutral-500 !w-2 !h-2" />

      <div className="flex items-center justify-between pb-1.5 border-b border-neutral-100 gap-2">
        <div className="flex items-center space-x-1.5 truncate">
          {isCustomer ? (
            <ArrowDownLeft size={13} className="text-emerald-600 shrink-0" />
          ) : isTax ? (
            <ShieldCheck size={13} className="text-purple-600 shrink-0" />
          ) : (
            <ArrowUpRight size={13} className="text-amber-600 shrink-0" />
          )}
          <span className="font-bold text-neutral-900 text-xs truncate">{data.label as string}</span>
        </div>
        <span className={`text-[9px] px-1.5 py-0.5 font-semibold uppercase tracking-wider shrink-0 ${typeColor}`}>
          {data.entityType as string}
        </span>
      </div>

      <div className="mt-2 flex items-baseline justify-between">
        <div>
          <span className="text-[10px] text-neutral-400 block uppercase tracking-wider">
            {isCustomer ? 'Receivable' : isTax ? 'Tax Due' : 'Payable'}
          </span>
          <span className="font-display font-bold text-sm text-neutral-900 mt-0.5 block">
            ₹{(data.amount as number).toLocaleString('en-IN')}
          </span>
        </div>
        {Boolean(data.invoiceNumber) && (
          <span className="text-[10px] text-neutral-400 font-mono">{data.invoiceNumber as string}</span>
        )}
      </div>
    </div>
  );
}

const nodeTypes = {
  businessNode: BusinessNode,
  bankNode: BankNode,
  counterpartyNode: CounterpartyNode,
};

// ---------------------------------------------------------------------------
// Main Entity Graph Component
// ---------------------------------------------------------------------------

export default function EntityGraphView({
  businessName = 'My Business',
  bankStatements,
  billsAndInvoices,
}: EntityGraphViewProps) {
  const [selectedNodeData, setSelectedNodeData] = useState<any | null>(null);

  // Generate initial ReactFlow nodes and edges
  const { initialNodes, initialEdges } = useMemo(() => {
    const rawNodes: Node[] = [];
    const rawEdges: Edge[] = [];

    // Center Node: Business
    const centerX = 320;
    const centerY = 200;

    rawNodes.push({
      id: 'root-business',
      type: 'businessNode',
      position: { x: centerX, y: centerY },
      data: { label: businessName, entityType: 'BUSINESS' },
    });

    const totalSurrounding = bankStatements.length + billsAndInvoices.length;
    const radius = Math.max(220, Math.min(360, 180 + totalSurrounding * 18));
    const angleStep = totalSurrounding > 0 ? (2 * Math.PI) / totalSurrounding : 0;
    let index = 0;

    // 1. Bank Statement Nodes
    bankStatements.forEach((stmt) => {
      const angle = index * angleStep;
      const x = Math.round(centerX + radius * Math.cos(angle));
      const y = Math.round(centerY + radius * Math.sin(angle));
      const nodeId = `bank-${stmt.id}`;

      rawNodes.push({
        id: nodeId,
        type: 'bankNode',
        position: { x, y },
        data: {
          label: stmt.bankName || 'Bank Account',
          amount: stmt.closingBalance,
          accountMasked: stmt.accountNumberMasked,
          transactionCount: stmt.transactionCount,
          fileName: stmt.fileName,
          reconciliationStatus: stmt.reconciliationStatus,
          entityType: 'BANK',
        },
      });

      rawEdges.push({
        id: `edge-root-${nodeId}`,
        source: 'root-business',
        target: nodeId,
        type: 'smoothstep',
        animated: true,
        style: { stroke: '#0284c7', strokeWidth: 1.5 },
      });

      index++;
    });

    // 2. Bills & Invoices Nodes (Customers, Vendors, Taxes)
    billsAndInvoices.forEach((doc) => {
      const isCustomer = doc.counterpartyType === 'CUSTOMER';
      const isTax = doc.counterpartyType === 'TAX_AUTHORITY' || doc.category === 'STATUTORY_TAX';
      const entityType = isCustomer ? 'CUSTOMER' : isTax ? 'TAX' : 'VENDOR';

      const angle = index * angleStep;
      const x = Math.round(centerX + radius * Math.cos(angle));
      const y = Math.round(centerY + radius * Math.sin(angle));
      const nodeId = `doc-${doc.id}`;

      rawNodes.push({
        id: nodeId,
        type: 'counterpartyNode',
        position: { x, y },
        data: {
          label: doc.counterpartyName || 'Counterparty',
          amount: doc.amount,
          invoiceNumber: doc.invoiceNumber,
          category: doc.category,
          dueDate: doc.dueDate,
          gstin: doc.gstin,
          reconciliationStatus: doc.reconciliationStatus,
          fileName: doc.fileName,
          entityType,
        },
      });

      const edgeColor = isCustomer ? '#16a34a' : isTax ? '#9333ea' : '#d97706';

      rawEdges.push({
        id: `edge-root-${nodeId}`,
        source: 'root-business',
        target: nodeId,
        type: 'smoothstep',
        animated: isCustomer,
        style: { stroke: edgeColor, strokeWidth: 1.5 },
      });

      index++;
    });

    return { initialNodes: rawNodes, initialEdges: rawEdges };
  }, [businessName, bankStatements, billsAndInvoices]);

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNodeData(node.data);
  }, []);

  const totalEntities = bankStatements.length + billsAndInvoices.length;

  return (
    <div className="w-full bg-white border border-neutral-200 divide-y divide-neutral-200">
      {/* Header */}
      <div className="p-4 sm:p-6 bg-white flex flex-col sm:flex-row sm:items-baseline justify-between gap-3">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400 block mb-1">
            Relationships
          </span>
          <h2 className="font-display font-bold text-2xl sm:text-3xl text-neutral-900 tracking-tight">
            Entity Graph
          </h2>
          <p className="text-xs text-neutral-500 mt-1">
            Interactive entity relationship graph connecting bank accounts, trade suppliers, customers, and tax authorities.
          </p>
        </div>

        <div className="flex items-center space-x-3 text-xs text-neutral-500">
          <span className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 bg-sky-500 inline-block" />
            <span>Banks</span>
          </span>
          <span className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 bg-emerald-500 inline-block" />
            <span>Customers</span>
          </span>
          <span className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 bg-amber-500 inline-block" />
            <span>Suppliers</span>
          </span>
          <span className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 bg-purple-500 inline-block" />
            <span>Taxes</span>
          </span>
        </div>
      </div>

      {/* Graph Area */}
      <div className="bg-neutral-50/40">
        {totalEntities === 0 ? (
          <div className="h-72 flex flex-col items-center justify-center space-y-3 text-center bg-white p-8">
            <Layers size={32} className="text-neutral-400" />
            <div>
              <h3 className="font-display font-bold text-base text-neutral-800">
                No Entities In Network
              </h3>
              <p className="text-xs text-neutral-500 max-w-sm mt-1">
                Upload bank statements or invoices in the upload zone above to map your financial relationship network.
              </p>
            </div>
          </div>
        ) : (
          <div className="w-full flex flex-col lg:flex-row divide-y lg:divide-y-0 lg:divide-x divide-neutral-200">
            {/* React Flow Viewport */}
            <div className="flex-1 h-[460px] bg-white relative">
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeClick={onNodeClick}
                fitView
                fitViewOptions={{ padding: 0.2 }}
                minZoom={0.4}
                maxZoom={1.5}
                proOptions={{ hideAttribution: true }}
              >
                <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#e5e5e5" />
                <Controls
                  showInteractive={false}
                  className="!bg-white !border !border-neutral-200 !shadow-none !rounded-none"
                />
                <MiniMap
                  className="!border !border-neutral-200 !rounded-none !bg-neutral-50"
                  nodeColor={(n) => {
                    if (n.type === 'businessNode') return '#171717';
                    if (n.data?.entityType === 'BANK') return '#0284c7';
                    if (n.data?.entityType === 'CUSTOMER') return '#16a34a';
                    if (n.data?.entityType === 'TAX') return '#9333ea';
                    return '#d97706';
                  }}
                />
              </ReactFlow>
            </div>

            {/* Inspector Drawer */}
            <div className="w-full lg:w-80 p-5 bg-white flex flex-col justify-between text-xs space-y-4">
              <div>
                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block mb-3">
                  Node Inspector
                </span>

                {selectedNodeData ? (
                  <div className="space-y-4 animate-fadeIn">
                    <div>
                      <span className="font-bold text-sm text-neutral-900 block font-display">
                        {selectedNodeData.label}
                      </span>
                      <span className="inline-block mt-1 px-2 py-0.5 bg-neutral-100 font-mono text-[10px] text-neutral-700 font-semibold">
                        {selectedNodeData.entityType}
                      </span>
                    </div>

                    {selectedNodeData.amount != null && (
                      <div className="pt-3 border-t border-neutral-100">
                        <span className="text-[11px] text-neutral-400 block uppercase tracking-wider">
                          Amount / Balance
                        </span>
                        <span className="font-display font-bold text-xl text-neutral-900 mt-0.5 block">
                          ₹{(selectedNodeData.amount as number).toLocaleString('en-IN')}
                        </span>
                      </div>
                    )}

                    {selectedNodeData.invoiceNumber && (
                      <div className="text-[11px] text-neutral-600 flex justify-between">
                        <span className="text-neutral-400">Invoice:</span>
                        <span className="font-mono font-medium text-neutral-900">{selectedNodeData.invoiceNumber}</span>
                      </div>
                    )}

                    {selectedNodeData.dueDate && (
                      <div className="text-[11px] text-neutral-600 flex justify-between">
                        <span className="text-neutral-400">Due Date:</span>
                        <span className="font-medium text-neutral-900">{selectedNodeData.dueDate}</span>
                      </div>
                    )}

                    {selectedNodeData.gstin && (
                      <div className="text-[11px] text-neutral-600 flex justify-between">
                        <span className="text-neutral-400">GSTIN:</span>
                        <span className="font-mono text-neutral-900">{selectedNodeData.gstin}</span>
                      </div>
                    )}

                    {selectedNodeData.fileName && (
                      <div className="pt-2 border-t border-neutral-100 text-[10px] text-neutral-500 flex items-center space-x-1.5">
                        <FileText size={12} className="text-neutral-400 shrink-0" />
                        <span className="truncate">{selectedNodeData.fileName}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-neutral-400 text-xs py-12 text-center space-y-2">
                    <Info size={18} className="mx-auto text-neutral-300" />
                    <p>Click any node or drag elements around the canvas to inspect relationship details.</p>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-neutral-100 text-[10px] text-neutral-400 flex items-center justify-between">
                <span>React Flow Graph Engine</span>
                <span className="font-mono">{totalEntities + 1} Nodes</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
