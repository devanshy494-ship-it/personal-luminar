import { useState, useCallback, useMemo, useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  MarkerType,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, ArrowLeft, Expand, Shrink, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface MindmapBranch {
  label: string;
  description?: string;
  color: string;
  children?: {
    label: string;
    description?: string;
    children?: { label: string; description?: string }[];
  }[];
}

interface MindmapData {
  title: string;
  branches: MindmapBranch[];
}

// Base hue/saturation for each color name
const COLOR_BASE: Record<string, { h: number; s: number }> = {
  blue: { h: 210, s: 90 },
  purple: { h: 270, s: 80 },
  green: { h: 140, s: 70 },
  orange: { h: 30, s: 90 },
  red: { h: 0, s: 80 },
  teal: { h: 180, s: 70 },
  pink: { h: 330, s: 80 },
  indigo: { h: 240, s: 70 },
};

// Outline styles to differentiate same-level nodes from different parents
const OUTLINE_STYLES = ['solid', 'dashed', 'dotted', 'double'] as const;

function getOutlineStyle(parentIndex: number): string {
  return OUTLINE_STYLES[parentIndex % OUTLINE_STYLES.length];
}

// depth 0 = branch (darkest), 1 = child, 2 = leaf, 3+ = expanded (lightest)
function getColorAtDepth(colorName: string, depth: number) {
  const base = COLOR_BASE[colorName] || COLOR_BASE.blue;
  const { h, s } = base;
  // bg lightness: darker at depth 0, lighter as depth increases
  const bgL = Math.min(97, 85 + depth * 4);
  // border lightness: darker at depth 0, lighter as depth increases
  const borderL = Math.min(75, 40 + depth * 8);
  // text lightness: darker at depth 0, lighter as depth increases
  const textL = Math.min(45, 20 + depth * 6);
  // edge matches border
  const edgeL = borderL;
  // saturation decreases slightly at deeper levels
  const adjS = Math.max(30, s - depth * 8);

  return {
    bg: `hsl(${h} ${adjS}% ${bgL}%)`,
    border: `hsl(${h} ${adjS}% ${borderL}%)`,
    text: `hsl(${h} ${adjS}% ${textL}%)`,
    edge: `hsl(${h} ${adjS}% ${edgeL}%)`,
  };
}

// Extract plain text label from a node (handles JSX labels)
function getNodeLabel(node: Node): string {
  const data = node.data as any;
  if (typeof data?.label === 'string') return data.label;
  // For JSX labels, try to extract from the node id pattern or stored metadata
  return data?._plainLabel || node.id;
}

function buildNodesAndEdges(data: MindmapData): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  nodes.push({
    id: 'center',
    position: { x: 0, y: 0 },
    data: { label: data.title, _plainLabel: data.title, _colorName: 'primary' },
    type: 'default',
    style: {
      background: 'hsl(var(--primary))',
      color: 'hsl(var(--primary-foreground))',
      border: '3px solid hsl(var(--primary))',
      borderRadius: '16px',
      padding: '16px 24px',
      fontSize: '16px',
      fontWeight: '700',
      boxShadow: '0 4px 24px -6px hsl(var(--primary) / 0.4)',
      minWidth: '180px',
      textAlign: 'center' as const,
    },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
  });

  const branchCount = data.branches.length;
  const angleStep = (2 * Math.PI) / branchCount;
  const level1Radius = 350;
  const level2Radius = 250;
  const level3Radius = 180;

  data.branches.forEach((branch, bi) => {
    const angle = angleStep * bi - Math.PI / 2;
    const bx = Math.cos(angle) * level1Radius;
    const by = Math.sin(angle) * level1Radius;
    const branchId = `b-${bi}`;
    const color = getColorAtDepth(branch.color, 0);

    nodes.push({
      id: branchId,
      position: { x: bx, y: by },
      data: {
        label: (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 600, fontSize: '13px' }}>{branch.label}</div>
            {branch.description && (
              <div style={{ fontSize: '10px', opacity: 0.7, marginTop: '4px', maxWidth: '160px' }}>{branch.description}</div>
            )}
          </div>
        ),
        _plainLabel: branch.label,
        _colorName: branch.color,
        _depth: 0,
        _branchIndex: bi,
      },
      style: {
        background: color.bg,
        border: `2.5px solid ${color.border}`,
        borderRadius: '14px',
        padding: '12px 16px',
        color: color.text,
        minWidth: '120px',
        maxWidth: '200px',
      },
    });

    edges.push({
      id: `e-center-${branchId}`,
      source: 'center',
      target: branchId,
      style: { stroke: color.edge, strokeWidth: 2.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: color.edge, width: 16, height: 16 },
      animated: true,
    });

    if (branch.children) {
      const childCount = branch.children.length;
      const childAngleSpread = Math.min(0.6, (childCount - 1) * 0.15);

      branch.children.forEach((child, ci) => {
        const childAngle = angle + (ci - (childCount - 1) / 2) * childAngleSpread;
        const cx = bx + Math.cos(childAngle) * level2Radius;
        const cy = by + Math.sin(childAngle) * level2Radius;
        const childId = `b-${bi}-c-${ci}`;
        const childColor = getColorAtDepth(branch.color, 1);
        const outlineStyle = getOutlineStyle(bi);

        nodes.push({
          id: childId,
          position: { x: cx, y: cy },
          data: {
            label: (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 500, fontSize: '12px' }}>{child.label}</div>
                {child.description && (
                  <div style={{ fontSize: '9px', opacity: 0.65, marginTop: '3px', maxWidth: '130px' }}>{child.description}</div>
                )}
              </div>
            ),
            _plainLabel: child.label,
            _colorName: branch.color,
            _depth: 1,
            _branchIndex: bi,
          },
          style: {
            background: childColor.bg,
            border: `1.5px ${outlineStyle} ${childColor.border}`,
            borderRadius: '10px',
            padding: '8px 12px',
            color: childColor.text,
            minWidth: '90px',
            maxWidth: '170px',
          },
        });

        edges.push({
          id: `e-${branchId}-${childId}`,
          source: branchId,
          target: childId,
          style: { stroke: childColor.edge, strokeWidth: 1.5, opacity: 0.7 },
        });

        if (child.children) {
          child.children.forEach((leaf, li) => {
            const leafAngle = childAngle + (li - (child.children!.length - 1) / 2) * 0.3;
            const lx = cx + Math.cos(leafAngle) * level3Radius;
            const ly = cy + Math.sin(leafAngle) * level3Radius;
            const leafId = `b-${bi}-c-${ci}-l-${li}`;
            const leafColor = getColorAtDepth(branch.color, 2);
            const leafOutline = getOutlineStyle(ci);

            nodes.push({
              id: leafId,
              position: { x: lx, y: ly },
              data: {
                label: (
                  <div style={{ textAlign: 'center', fontSize: '11px' }}>
                    {leaf.label}
                  </div>
                ),
                _plainLabel: leaf.label,
                _colorName: branch.color,
                _depth: 2,
                _branchIndex: bi,
              },
              style: {
                background: leafColor.bg,
                border: `1px ${leafOutline} ${leafColor.border}`,
                borderRadius: '8px',
                padding: '6px 10px',
                color: leafColor.text,
                fontSize: '11px',
                maxWidth: '140px',
              },
            });

            edges.push({
              id: `e-${childId}-${leafId}`,
              source: childId,
              target: leafId,
              style: { stroke: leafColor.edge, strokeWidth: 1, opacity: 0.5 },
            });
          });
        }
      });
    }
  });

  return { nodes, edges };
}

export default function Mindmap() {
  const location = useLocation();
  const navigate = useNavigate();
  const { mindmapId } = useParams<{ mindmapId: string }>();
  const [mindmapData, setMindmapData] = useState<MindmapData | null>(location.state?.mindmap || null);
  const topicId: string | null = location.state?.topicId || null;
  const [dbLoading, setDbLoading] = useState(!mindmapData);

  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [expandingNode, setExpandingNode] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  // Load from DB if not passed via state
  useEffect(() => {
    if (mindmapData || !mindmapId) return;
    (async () => {
      const { data, error } = await supabase
        .from('mindmaps')
        .select('mindmap_data, topic')
        .eq('id', mindmapId)
        .single();
      if (error || !data) {
        toast.error('Failed to load mindmap');
        navigate('/dashboard');
        return;
      }
      setMindmapData(data.mindmap_data as unknown as MindmapData);
      setDbLoading(false);
    })();
  }, [mindmapId, mindmapData, navigate]);

  const { initialNodes, initialEdges } = useMemo(() => {
    if (!mindmapData) return { initialNodes: [], initialEdges: [] };
    const { nodes, edges } = buildNodesAndEdges(mindmapData);
    return { initialNodes: nodes, initialEdges: edges };
  }, [mindmapData]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Re-initialize nodes/edges when mindmapData loads from DB
  useEffect(() => {
    if (!mindmapData) return;
    const { nodes: n, edges: e } = buildNodesAndEdges(mindmapData);
    setNodes(n);
    setEdges(e);
  }, [mindmapData]);

  const onNodeClick = useCallback((_: any, node: Node) => {
    setSelectedNode(prev => prev?.id === node.id ? null : node);
  }, []);

  const handleExpandNode = useCallback(async (node: Node) => {
    const nodeId = node.id;
    const nodeData = node.data as any;
    const label = nodeData?._plainLabel || nodeId;
    const colorName = nodeData?._colorName || 'blue';
    const parentDepth = nodeData?._depth ?? 1;
    const branchIndex = nodeData?._branchIndex ?? 0;
    const newDepth = parentDepth + 1;
    const color = getColorAtDepth(colorName, newDepth);
    const outlineStyle = getOutlineStyle(branchIndex);

    setExpandingNode(nodeId);

    try {
      const { data, error } = await supabase.functions.invoke('expand-mindmap-node', {
        body: {
          nodeLabel: label,
          parentContext: mindmapData?.title || '',
          rootTopic: mindmapData?.title || label,
        },
      });

      if (error) throw error;
      if (!data?.children?.length) {
        toast.info('No further expansion available for this topic.');
        return;
      }

      const children: { label: string; description?: string }[] = data.children;

      const parentPos = node.position;
      const expandRadius = 180;
      const angleStep = (2 * Math.PI) / children.length;
      const baseAngle = Math.atan2(parentPos.y, parentPos.x);

      const newNodes: Node[] = [];
      const newEdges: Edge[] = [];

      children.forEach((child, i) => {
        const angle = baseAngle + angleStep * i - ((children.length - 1) * angleStep) / 2;
        const cx = parentPos.x + Math.cos(angle) * expandRadius;
        const cy = parentPos.y + Math.sin(angle) * expandRadius;
        const childId = `${nodeId}-exp-${i}`;

        newNodes.push({
          id: childId,
          position: { x: cx, y: cy },
          data: {
            label: (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 500, fontSize: '11px' }}>{child.label}</div>
                {child.description && (
                  <div style={{ fontSize: '9px', opacity: 0.65, marginTop: '3px', maxWidth: '120px' }}>{child.description}</div>
                )}
              </div>
            ),
            _plainLabel: child.label,
            _colorName: colorName,
            _depth: newDepth,
            _branchIndex: branchIndex,
          },
          style: {
            background: color.bg,
            border: `1.5px ${outlineStyle} ${color.border}`,
            borderRadius: '10px',
            padding: '8px 12px',
            color: color.text,
            minWidth: '80px',
            maxWidth: '160px',
          },
        });

        newEdges.push({
          id: `e-${nodeId}-${childId}`,
          source: nodeId,
          target: childId,
          style: { stroke: color.edge, strokeWidth: 1.5, opacity: 0.6 },
          animated: true,
        });
      });

      setNodes(prev => [...prev, ...newNodes]);
      setEdges(prev => [...prev, ...newEdges]);
      setExpandedNodes(prev => new Set([...prev, nodeId]));
      toast.success(`Expanded "${label}" with ${children.length} sub-topics`);
    } catch (e: any) {
      console.error('Expand error:', e);
      toast.error(e?.message || 'Failed to expand node');
    } finally {
      setExpandingNode(null);
      setSelectedNode(null);
    }
  }, [mindmapData, setNodes, setEdges]);

  const handleCollapseNode = useCallback((node: Node) => {
    const nodeId = node.id;
    // Find all descendant node IDs recursively
    const getDescendants = (parentId: string, edgeList: Edge[]): Set<string> => {
      const children = edgeList.filter(e => e.source === parentId).map(e => e.target);
      const all = new Set<string>(children);
      children.forEach(childId => {
        getDescendants(childId, edgeList).forEach(id => all.add(id));
      });
      return all;
    };

    setEdges(prev => {
      const descendants = getDescendants(nodeId, prev);
      setNodes(prevNodes => prevNodes.filter(n => !descendants.has(n.id)));
      return prev.filter(e => !descendants.has(e.target));
    });

    setExpandedNodes(prev => {
      const next = new Set(prev);
      next.delete(nodeId);
      return next;
    });

    setSelectedNode(null);
    toast.success(`Collapsed "${(node.data as any)?._plainLabel || nodeId}"`);
  }, [setNodes, setEdges]);

  if (dbLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!mindmapData) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
        <p className="text-muted-foreground">No mindmap data. Generate a mindmap first.</p>
        <Button onClick={() => navigate('/dashboard')}>Go to Dashboard</Button>
      </div>
    );
  }

  const isExpanded = selectedNode ? expandedNodes.has(selectedNode.id) : false;
  const canExpand = selectedNode && selectedNode.id !== 'center' && expandingNode !== selectedNode.id;

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Nav */}
      <nav className="border-b border-border/50 glass-nav sticky top-0 z-50 shrink-0">
        <div className="container mx-auto flex items-center justify-between h-14 px-4">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg gradient-primary flex items-center justify-center neon-glow-sm">
              <BookOpen className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <span className="font-heading text-lg font-bold text-foreground">Luminar</span>
            <span className="text-muted-foreground mx-2">·</span>
            <span className="text-sm text-muted-foreground font-medium">{mindmapData.title}</span>
          </div>
          <div className="flex items-center gap-2">
            {topicId && (
              <Button variant="outline" size="sm" onClick={() => navigate(`/roadmap/${topicId}`)}>
                Back to Roadmap
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => navigate(topicId ? `/roadmap/${topicId}` : '/dashboard')}>
              <ArrowLeft className="h-4 w-4 mr-1" /> {topicId ? 'Back' : 'Dashboard'}
            </Button>
          </div>
        </div>
      </nav>

      {/* React Flow Canvas */}
      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onPaneClick={() => setSelectedNode(null)}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          minZoom={0.1}
          maxZoom={2}
          attributionPosition="bottom-left"
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} size={1} color="hsl(var(--muted-foreground) / 0.1)" />
          <Controls
            showInteractive={false}
            style={{
              background: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '12px',
              overflow: 'hidden',
            }}
          />
          <MiniMap
            nodeColor={(node) => {
              const style = node.style as any;
              return style?.background || 'hsl(var(--muted))';
            }}
            maskColor="hsl(var(--background) / 0.8)"
            style={{
              background: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '12px',
            }}
          />
        </ReactFlow>

        {/* Expand Tooltip */}
        <AnimatePresence>
          {selectedNode && selectedNode.id !== 'center' && (
            <motion.div
              key="expand-tooltip"
              initial={{ opacity: 0, y: 8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="absolute top-20 right-4 z-50"
            >
              <div className="glass-card border border-border/50 rounded-xl p-3 shadow-lg max-w-[220px]">
                <p className="text-xs font-semibold text-foreground mb-1 truncate">
                  {(selectedNode.data as any)?._plainLabel || selectedNode.id}
                </p>
                {(selectedNode.data as any)?._plainLabel && (
                  <p className="text-[10px] text-muted-foreground mb-2">
                    {isExpanded ? 'Expand further or collapse' : 'Click below to dive deeper'}
                  </p>
                )}
                <div className="flex flex-col gap-1.5">
                  <Button
                    size="sm"
                    className="w-full text-xs"
                    disabled={!canExpand || !!expandingNode}
                    onClick={() => handleExpandNode(selectedNode)}
                  >
                    {expandingNode === selectedNode.id ? (
                      <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Expanding...</>
                    ) : (
                      <><Expand className="h-3 w-3 mr-1" /> Expand this topic</>
                    )}
                  </Button>
                  {isExpanded && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full text-xs"
                      disabled={!!expandingNode}
                      onClick={() => handleCollapseNode(selectedNode)}
                    >
                      <Shrink className="h-3 w-3 mr-1" /> Collapse
                    </Button>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Loading overlay */}
        <AnimatePresence>
          {expandingNode && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-background/30 backdrop-blur-[2px] flex items-center justify-center z-40 pointer-events-none"
            >
              <div className="flex items-center gap-2 bg-card border border-border rounded-xl px-4 py-3 shadow-lg">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-sm text-foreground font-medium">Expanding topic...</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Legend */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="absolute bottom-20 left-4 p-3 rounded-xl glass-card border border-border/50 text-xs max-w-[200px]"
        >
          <p className="font-semibold text-foreground mb-2">Navigation</p>
          <div className="space-y-1 text-muted-foreground">
            <p>🖱 Scroll to zoom</p>
            <p>🖱 Drag to pan</p>
            <p>🖱 Click node to expand</p>
            <p>🖱 Drag nodes to rearrange</p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
