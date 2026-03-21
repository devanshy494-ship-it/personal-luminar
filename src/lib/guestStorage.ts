// Guest mode localStorage storage
const GUEST_STORAGE_KEY = 'luminar_guest_data';

export interface GuestData {
  topics: GuestTopic[];
  flashcards: GuestFlashcard[];
  flashcardGroups: GuestFlashcardGroup[];
  quizResults: GuestQuizResult[];
  roadmaps: GuestRoadmap[];
  mindmaps: GuestMindmap[];
}

export interface GuestTopic {
  id: string;
  title: string;
  created_at: string;
  generation_context?: any;
}

export interface GuestFlashcard {
  id: string;
  topic_id: string;
  front: string;
  back: string;
  mastery_level: number;
  step_index: number | null;
  group_id: string | null;
  created_at: string;
}

export interface GuestFlashcardGroup {
  id: string;
  name: string;
  topic_id: string;
  created_at: string;
}

export interface GuestQuizResult {
  id: string;
  topic_id: string;
  score: number;
  total: number;
  questions: any[];
  step_index: number | null;
  wrong_questions: any[];
  completed_at: string;
}

export interface GuestRoadmap {
  id: string;
  topic_id: string;
  steps: any[];
  progress: number;
  created_at: string;
  updated_at: string;
}

export interface GuestMindmap {
  id: string;
  topic: string;
  mindmap_data: any;
  created_at: string;
  updated_at: string;
}

const getDefaultData = (): GuestData => ({
  topics: [],
  flashcards: [],
  flashcardGroups: [],
  quizResults: [],
  roadmaps: [],
  mindmaps: [],
});

export const guestStorage = {
  getData(): GuestData {
    try {
      const raw = localStorage.getItem(GUEST_STORAGE_KEY);
      if (!raw) return getDefaultData();
      return JSON.parse(raw);
    } catch {
      return getDefaultData();
    }
  },

  setData(data: GuestData) {
    localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(data));
  },

  clearData() {
    localStorage.removeItem(GUEST_STORAGE_KEY);
  },

  // Topics
  getTopics(): GuestTopic[] {
    return this.getData().topics;
  },
  addTopic(topic: Omit<GuestTopic, 'id' | 'created_at'>): GuestTopic {
    const data = this.getData();
    const newTopic: GuestTopic = { ...topic, id: crypto.randomUUID(), created_at: new Date().toISOString() };
    data.topics.push(newTopic);
    this.setData(data);
    return newTopic;
  },
  getTopic(id: string): GuestTopic | undefined {
    return this.getTopics().find(t => t.id === id);
  },
  deleteTopic(id: string) {
    const data = this.getData();
    data.topics = data.topics.filter(t => t.id !== id);
    data.flashcards = data.flashcards.filter(f => f.topic_id !== id);
    data.roadmaps = data.roadmaps.filter(r => r.topic_id !== id);
    data.quizResults = data.quizResults.filter(q => q.topic_id !== id);
    this.setData(data);
  },

  // Flashcards
  getFlashcards(topicId?: string, groupId?: string, stepIndex?: number): GuestFlashcard[] {
    let cards = this.getData().flashcards;
    if (topicId) cards = cards.filter(f => f.topic_id === topicId);
    if (groupId) cards = cards.filter(f => f.group_id === groupId);
    if (stepIndex !== undefined) cards = cards.filter(f => f.step_index === stepIndex);
    return cards.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  },
  addFlashcards(cards: Omit<GuestFlashcard, 'id' | 'created_at'>[]): GuestFlashcard[] {
    const data = this.getData();
    const newCards = cards.map(c => ({ ...c, id: crypto.randomUUID(), created_at: new Date().toISOString() }));
    data.flashcards.push(...newCards);
    this.setData(data);
    return newCards;
  },
  deleteFlashcard(id: string) {
    const data = this.getData();
    data.flashcards = data.flashcards.filter(f => f.id !== id);
    this.setData(data);
  },
  updateFlashcard(id: string, updates: Partial<GuestFlashcard>) {
    const data = this.getData();
    const idx = data.flashcards.findIndex(f => f.id === id);
    if (idx >= 0) data.flashcards[idx] = { ...data.flashcards[idx], ...updates };
    this.setData(data);
  },

  // Flashcard Groups
  getFlashcardGroups(topicId?: string): GuestFlashcardGroup[] {
    let groups = this.getData().flashcardGroups;
    if (topicId) groups = groups.filter(g => g.topic_id === topicId);
    return groups;
  },
  addFlashcardGroup(group: Omit<GuestFlashcardGroup, 'id' | 'created_at'>): GuestFlashcardGroup {
    const data = this.getData();
    const newGroup: GuestFlashcardGroup = { ...group, id: crypto.randomUUID(), created_at: new Date().toISOString() };
    data.flashcardGroups.push(newGroup);
    this.setData(data);
    return newGroup;
  },
  updateFlashcardGroup(id: string, updates: Partial<GuestFlashcardGroup>) {
    const data = this.getData();
    const idx = data.flashcardGroups.findIndex(g => g.id === id);
    if (idx >= 0) data.flashcardGroups[idx] = { ...data.flashcardGroups[idx], ...updates };
    this.setData(data);
  },
  deleteFlashcardGroup(id: string) {
    const data = this.getData();
    data.flashcardGroups = data.flashcardGroups.filter(g => g.id !== id);
    data.flashcards = data.flashcards.map(f => f.group_id === id ? { ...f, group_id: null } : f);
    this.setData(data);
  },

  // Quiz Results
  getQuizResults(topicId?: string): GuestQuizResult[] {
    let results = this.getData().quizResults;
    if (topicId) results = results.filter(q => q.topic_id === topicId);
    return results.sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime());
  },
  addQuizResult(result: Omit<GuestQuizResult, 'id' | 'completed_at'>): GuestQuizResult {
    const data = this.getData();
    const newResult: GuestQuizResult = { ...result, id: crypto.randomUUID(), completed_at: new Date().toISOString() };
    data.quizResults.push(newResult);
    this.setData(data);
    return newResult;
  },
  deleteQuizResult(id: string) {
    const data = this.getData();
    data.quizResults = data.quizResults.filter(q => q.id !== id);
    this.setData(data);
  },

  // Roadmaps
  getRoadmaps(): GuestRoadmap[] {
    return this.getData().roadmaps.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  },
  getRoadmap(topicId: string): GuestRoadmap | undefined {
    return this.getData().roadmaps.find(r => r.topic_id === topicId);
  },
  addRoadmap(roadmap: Omit<GuestRoadmap, 'id' | 'created_at' | 'updated_at'>): GuestRoadmap {
    const data = this.getData();
    const now = new Date().toISOString();
    const newRoadmap: GuestRoadmap = { ...roadmap, id: crypto.randomUUID(), created_at: now, updated_at: now };
    data.roadmaps.push(newRoadmap);
    this.setData(data);
    return newRoadmap;
  },
  updateRoadmap(topicId: string, updates: Partial<GuestRoadmap>) {
    const data = this.getData();
    const idx = data.roadmaps.findIndex(r => r.topic_id === topicId);
    if (idx >= 0) data.roadmaps[idx] = { ...data.roadmaps[idx], ...updates, updated_at: new Date().toISOString() };
    this.setData(data);
  },
  deleteRoadmap(topicId: string) {
    const data = this.getData();
    data.roadmaps = data.roadmaps.filter(r => r.topic_id !== topicId);
    this.setData(data);
  },

  // Mindmaps
  getMindmaps(): GuestMindmap[] {
    return this.getData().mindmaps.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  },
  getMindmap(id: string): GuestMindmap | undefined {
    return this.getData().mindmaps.find(m => m.id === id);
  },
  addMindmap(mindmap: Omit<GuestMindmap, 'id' | 'created_at' | 'updated_at'>): GuestMindmap {
    const data = this.getData();
    const now = new Date().toISOString();
    const newMindmap: GuestMindmap = { ...mindmap, id: crypto.randomUUID(), created_at: now, updated_at: now };
    data.mindmaps.push(newMindmap);
    this.setData(data);
    return newMindmap;
  },
  updateMindmap(id: string, updates: Partial<GuestMindmap>) {
    const data = this.getData();
    const idx = data.mindmaps.findIndex(m => m.id === id);
    if (idx >= 0) data.mindmaps[idx] = { ...data.mindmaps[idx], ...updates, updated_at: new Date().toISOString() };
    this.setData(data);
  },
  deleteMindmap(id: string) {
    const data = this.getData();
    data.mindmaps = data.mindmaps.filter(m => m.id !== id);
    this.setData(data);
  },
};
