import { randomUUID, createHash } from 'node:crypto';
import { Collector } from './collector.js';

type Panel = { hostId?: string; selected?: string; hook?: string; source: string;
  revision?: string; snapshot?: any; touched: number; disconnected: boolean; hostMatched: boolean; query?:string; includeArchived?:boolean };
export class Panels {
  private panels = new Map<string, Panel>();
  private queues = new Map<string, Promise<any>>();
  constructor(readonly collector = new Collector()) {}
  create(hostId?: string) {
    const id = randomUUID();
    this.panels.set(id, { hostId, source: 'waiting', touched: Date.now(), disconnected: false, hostMatched: false });
    return id;
  }
  private panel(id: string, hostId?: string) {
    // UI state may outlive an MCP restart. Recover selection from the exact
    // host ID or hooks.
    let panel = this.panels.get(id);
    if (!panel) {
      if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Invalid panel session');
      panel = { hostId, source: 'waiting', touched: Date.now(), disconnected: false, hostMatched: false };
      this.panels.set(id, panel);
    }
    if (hostId) panel.hostId = hostId;
    panel.touched = Date.now();
    for (const [key, value] of this.panels) if (Date.now() - value.touched > 60 * 60 * 1000) this.panels.delete(key);
    return panel;
  }
  async tasks(id: string, hostId?: string, filters:{query?:string;includeArchived?:boolean;rescan?:boolean}={}) {
    const panel = this.panel(id, hostId);
    return this.collector.request('catalog', { hostId: panel.hostId,selectedId:panel.selected,query:filters.query??panel.query,includeArchived:filters.includeArchived??panel.includeArchived,rescan:filters.rescan });
  }
  async state(id: string, input: { taskId?: string; action?: 'select'|'rescan'; query?:string;includeArchived?:boolean;revision?: string } = {}, hostId?: string) {
    const previous = this.queues.get(id) ?? Promise.resolve();
    const request = previous.catch(() => {}).then(() => this.stateNow(id, input, hostId));
    this.queues.set(id, request);
    try { return await request; }
    finally { if (this.queues.get(id) === request) this.queues.delete(id); }
  }
  private async stateNow(id: string, input: { taskId?: string; action?: 'select'|'rescan'; query?:string;includeArchived?:boolean;revision?: string }, hostId?: string) {
    const panel = this.panel(id, hostId);
    const wasDisconnected = panel.disconnected;
    try {
      if(input.query!==undefined)panel.query=input.query;
      if(input.includeArchived!==undefined)panel.includeArchived=input.includeArchived;
      const catalog = await this.tasks(id, hostId,{rescan:input.action==='rescan'});
      const hookChanged = !!catalog.latestHook && panel.hook !== catalog.latestHook.sequence;
      const bindingChanged = panel.hostMatched !== !!catalog.hostMatched;
      const previousSelection = panel.selected;
      panel.hostMatched = !!catalog.hostMatched;
      if (input.action === 'select') {
        if (!catalog.tasks.some((task: any) => task.id === input.taskId) && input.taskId !== panel.selected && !(catalog.hostMatched && input.taskId === panel.hostId)) throw new Error('Task is not available locally');
        panel.selected = input.taskId; panel.source = 'manual';
      } else {
        if (catalog.hostMatched && (!panel.selected || (bindingChanged&&panel.source!=='manual') || (hookChanged && catalog.latestHook.id === panel.hostId) || (panel.source !== 'manual' && panel.selected !== panel.hostId))) {
          panel.selected = panel.hostId; panel.source = 'host-chat';
        } else if (!catalog.hostMatched && hookChanged) {
          panel.selected = catalog.latestHook.id; panel.source = 'latest-hook';
        }
      }
      // Consume hook changes during manual selection so only a new relevant
      // event resumes automatic following.
      panel.hook = catalog.latestHook?.sequence;
      // A failed switch must never expose the previous task's metrics under
      // the newly selected task, or reuse its collector revision.
      if (panel.selected !== previousSelection) {
        panel.snapshot = undefined; panel.revision = undefined;
      }
      let data: any = { unavailable: true };
      if (panel.selected) data = await this.collector.request('state', { taskId: panel.selected, revision: panel.revision });
      if (data.state) { panel.snapshot = data.state; panel.revision = data.revision; }
      else if (data.unavailable) { panel.snapshot = undefined; panel.revision = undefined; }
      panel.disconnected = false;
      const view = { ...panel.snapshot, version: 1, panelId: id, selectedId: panel.selected,
        selectionSource: panel.source, followingMode: panel.hostMatched ? 'host-chat' : 'latest-hook',
        disconnected: false,
        status: panel.snapshot?.status ?? (panel.selected ? 'Task unavailable · choose another task or refresh' : 'Waiting for a valid local task'),
        tasks: catalog.tasks,matchCount:catalog.matchCount,shownCount:catalog.shownCount,discovery:catalog.discovery, revision: createHash('sha256').update(JSON.stringify([panel.revision, panel.selected, panel.source, panel.hostMatched, catalog.tasks,catalog.matchCount,catalog.discovery])).digest('hex') };
      return !wasDisconnected && input.revision === view.revision ? { panelId: id, unchanged: true, revision: view.revision } : view;
    } catch (error) {
      if (input.action === 'select') throw error;
      panel.disconnected = true;
      return { ...panel.snapshot, version: 1, panelId: id, selectedId: panel.selected,
        selectionSource: panel.source, followingMode: panel.hostMatched ? 'host-chat' : 'latest-hook', disconnected: true,
        status: panel.snapshot ? 'Collector disconnected · showing last snapshot · retrying' : 'Collector disconnected · retrying', revision: `disconnected:${panel.revision ?? ''}` };
    }
  }
}
