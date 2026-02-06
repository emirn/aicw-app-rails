/**
 * AI Sources Module
 *
 * Provides visitor and bot source information for the UI
 * Data is auto-generated from backend sources
 */

import visitorSourcesData from './generated/generated-visitor-sources.json';
import botSourcesData from './generated/generated-bot-sources.json';
import type { UIVisitorSource, UIBotSource } from './generated/generated-sources.types';

// Type the imported data
export const VISITOR_SOURCES = visitorSourcesData as UIVisitorSource[];
export const BOT_SOURCES = botSourcesData as UIBotSource[];

// Export types
export type { UIVisitorSource, UIBotSource };
export type VisitorSourceName = string;
export type BotSourceName = string;

export function getVisitorSourceDisplay(name: string): string {
  const source = VISITOR_SOURCES.find((s) => s.name === name);
  return source?.name || name;
}

export function getBotSourceDisplay(name: string): string {
  const source = BOT_SOURCES.find((s) => s.desc === name);
  return source?.desc || name;
}

export function getSourceIconUrl(
  name: string,
  isBot: boolean = false,
  size: number = 32
): string {
  let domain = '';

  if (isBot) {
    const botSource = BOT_SOURCES.find((s) => s.desc === name);
    domain = botSource?.parent_url || 'aicw.io';
  } else {
    const visitorSource = VISITOR_SOURCES.find((s) => s.name === name);
    domain = visitorSource?.url || 'aicw.io';
  }

  return `https://www.google.com/s2/favicons?domain=${domain}&sz=${size}`;
}

export function getAllVisitorSources(): VisitorSourceName[] {
  return VISITOR_SOURCES.map((s) => s.name);
}

export function getAllBotSources(): BotSourceName[] {
  return BOT_SOURCES.map((s) => s.desc);
}

export function getAllSources(): string[] {
  return [...getAllVisitorSources(), ...getAllBotSources()];
}

export function isValidVisitorSource(name: string | null | undefined): boolean {
  if (!name) return false;
  return VISITOR_SOURCES.some((s) => s.name === name);
}

export function isValidBotSource(name: string | null | undefined): boolean {
  if (!name) return false;
  return BOT_SOURCES.some((s) => s.desc === name);
}

export function isValidSource(name: string | null | undefined): boolean {
  return isValidVisitorSource(name) || isValidBotSource(name);
}

export function getSourceByName(
  name: string
): UIVisitorSource | UIBotSource | undefined {
  const visitorSource = VISITOR_SOURCES.find((s) => s.name === name);
  if (visitorSource) return visitorSource;
  return BOT_SOURCES.find((s) => s.desc === name);
}

export function getVisitorSourcesByCategory(category: string): UIVisitorSource[] {
  return VISITOR_SOURCES.filter((s) => s.category === category);
}

export function getBotSourcesByCategory(category: string): UIBotSource[] {
  return BOT_SOURCES.filter((s) => s.ref_bot_category === category);
}
