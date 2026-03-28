#!/usr/bin/env tsx
/**
 * Firestore to PostgreSQL Migration Script
 * 
 * This script migrates data from Firebase Firestore to PostgreSQL.
 * Run with: npx tsx scripts/migrate-firestore-to-postgres.ts
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { db } from '../src/db';
import { notes, flashcards, chatSessions, chatMessages, apiKeys, customPersonas } from '../src/db/schema';
import * as fs from 'fs';
import * as path from 'path';

const FIREBASE_SERVICE_ACCOUNT_PATH = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH;

if (!FIREBASE_SERVICE_ACCOUNT_PATH) {
  console.error('Error: FIREBASE_SERVICE_ACCOUNT_KEY_PATH environment variable is required');
  console.error('Set it to the path of your Firebase service account JSON file');
  process.exit(1);
}

const BATCH_SIZE = 100;

interface MigrationStats {
  notes: { migrated: number; errors: number };
  flashcards: { migrated: number; errors: number };
  chatSessions: { migrated: number; errors: number };
  chatMessages: { migrated: number; errors: number };
  apiKeys: { migrated: number; errors: number };
  customPersonas: { migrated: number; errors: number };
}

const stats: MigrationStats = {
  notes: { migrated: 0, errors: 0 },
  flashcards: { migrated: 0, errors: 0 },
  chatSessions: { migrated: 0, errors: 0 },
  chatMessages: { migrated: 0, errors: 0 },
  apiKeys: { migrated: 0, errors: 0 },
  customPersonas: { migrated: 0, errors: 0 },
};

async function initializeFirebase() {
  const serviceAccount = JSON.parse(
    fs.readFileSync(path.resolve(FIREBASE_SERVICE_ACCOUNT_PATH!), 'utf-8')
  );
  
  initializeApp({
    credential: cert(serviceAccount),
  });
  
  return getFirestore();
}

function convertTimestamp(timestamp: any): Date | null {
  if (!timestamp) return null;
  if (timestamp.toDate) return timestamp.toDate();
  if (typeof timestamp === 'number') return new Date(timestamp);
  if (typeof timestamp === 'string') return new Date(timestamp);
  return null;
}

async function migrateNotes(firestore: ReturnType<typeof getFirestore>) {
  console.log('Migrating notes...');
  const snapshot = await firestore.collection('notes').get();
  
  for (let i = 0; i < snapshot.docs.length; i += BATCH_SIZE) {
    const batch = snapshot.docs.slice(i, i + BATCH_SIZE);
    
    for (const doc of batch) {
      try {
        const data = doc.data();
        await db.insert(notes).values({
          id: doc.id,
          userId: data.userId,
          title: data.title || 'Untitled',
          content: data.content || data.summary || '',
          tags: data.tags || [],
          source: data.source || 'import',
          createdAt: convertTimestamp(data.createdAt) || new Date(),
          updatedAt: convertTimestamp(data.updatedAt),
        }).onConflictDoNothing();
        
        stats.notes.migrated++;
      } catch (error) {
        console.error(`Error migrating note ${doc.id}:`, error);
        stats.notes.errors++;
      }
    }
    
    console.log(`  Progress: ${Math.min(i + BATCH_SIZE, snapshot.docs.length)}/${snapshot.docs.length}`);
  }
  
  console.log(`  Notes migrated: ${stats.notes.migrated}, errors: ${stats.notes.errors}`);
}

async function migrateFlashcards(firestore: ReturnType<typeof getFirestore>) {
  console.log('Migrating flashcards...');
  const snapshot = await firestore.collection('flashcards').get();
  
  for (let i = 0; i < snapshot.docs.length; i += BATCH_SIZE) {
    const batch = snapshot.docs.slice(i, i + BATCH_SIZE);
    
    for (const doc of batch) {
      try {
        const data = doc.data();
        await db.insert(flashcards).values({
          id: doc.id,
          userId: data.userId,
          noteId: data.noteId,
          question: data.question || '',
          answer: data.answer || '',
          stability: data.stability || 0,
          difficulty: data.difficulty || 0,
          elapsedDays: data.elapsedDays || 0,
          scheduledDays: data.scheduledDays || 0,
          reps: data.reps || 0,
          lapses: data.lapses || 0,
          state: data.state || 0,
          due: convertTimestamp(data.due) || new Date(),
          lastReview: convertTimestamp(data.lastReview),
          createdAt: convertTimestamp(data.createdAt) || new Date(),
        }).onConflictDoNothing();
        
        stats.flashcards.migrated++;
      } catch (error) {
        console.error(`Error migrating flashcard ${doc.id}:`, error);
        stats.flashcards.errors++;
      }
    }
    
    console.log(`  Progress: ${Math.min(i + BATCH_SIZE, snapshot.docs.length)}/${snapshot.docs.length}`);
  }
  
  console.log(`  Flashcards migrated: ${stats.flashcards.migrated}, errors: ${stats.flashcards.errors}`);
}

async function migrateChatSessions(firestore: ReturnType<typeof getFirestore>) {
  console.log('Migrating chat sessions...');
  const snapshot = await firestore.collection('chat_sessions').get();
  
  for (let i = 0; i < snapshot.docs.length; i += BATCH_SIZE) {
    const batch = snapshot.docs.slice(i, i + BATCH_SIZE);
    
    for (const doc of batch) {
      try {
        const data = doc.data();
        await db.insert(chatSessions).values({
          id: doc.id,
          userId: data.userId,
          title: data.title || 'New Session',
          model: data.model,
          personaId: data.personaId,
          createdAt: convertTimestamp(data.createdAt) || new Date(),
          updatedAt: convertTimestamp(data.updatedAt) || new Date(),
        }).onConflictDoNothing();
        
        stats.chatSessions.migrated++;
        
        if (data.messages && Array.isArray(data.messages)) {
          for (const msg of data.messages) {
            try {
              await db.insert(chatMessages).values({
                id: crypto.randomUUID(),
                sessionId: doc.id,
                role: msg.role,
                content: msg.text || msg.content || '',
                thinking: msg.thought || msg.thinking,
                createdAt: new Date(),
              });
              stats.chatMessages.migrated++;
            } catch (error) {
              console.error(`Error migrating message in session ${doc.id}:`, error);
              stats.chatMessages.errors++;
            }
          }
        }
      } catch (error) {
        console.error(`Error migrating chat session ${doc.id}:`, error);
        stats.chatSessions.errors++;
      }
    }
    
    console.log(`  Progress: ${Math.min(i + BATCH_SIZE, snapshot.docs.length)}/${snapshot.docs.length}`);
  }
  
  console.log(`  Chat sessions migrated: ${stats.chatSessions.migrated}, errors: ${stats.chatSessions.errors}`);
  console.log(`  Chat messages migrated: ${stats.chatMessages.migrated}, errors: ${stats.chatMessages.errors}`);
}

async function migrateApiKeys(firestore: ReturnType<typeof getFirestore>) {
  console.log('Migrating API keys...');
  const snapshot = await firestore.collection('account_secrets').get();
  
  for (const doc of snapshot.docs) {
    try {
      const data = doc.data();
      const providers = ['gemini', 'openai', 'minimax', 'zhipu', 'moonshot'];
      
      for (const provider of providers) {
        const key = data[`${provider}ApiKey`];
        if (key) {
          await db.insert(apiKeys).values({
            id: crypto.randomUUID(),
            userId: doc.id,
            provider,
            key,
            createdAt: new Date(),
          }).onConflictDoNothing();
          
          stats.apiKeys.migrated++;
        }
      }
    } catch (error) {
      console.error(`Error migrating API keys for ${doc.id}:`, error);
      stats.apiKeys.errors++;
    }
  }
  
  console.log(`  API keys migrated: ${stats.apiKeys.migrated}, errors: ${stats.apiKeys.errors}`);
}

async function migrateCustomPersonas(firestore: ReturnType<typeof getFirestore>) {
  console.log('Migrating custom personas...');
  const snapshot = await firestore.collection('custom_personas').get();
  
  for (let i = 0; i < snapshot.docs.length; i += BATCH_SIZE) {
    const batch = snapshot.docs.slice(i, i + BATCH_SIZE);
    
    for (const doc of batch) {
      try {
        const data = doc.data();
        await db.insert(customPersonas).values({
          id: doc.id,
          userId: data.userId,
          name: data.name || 'Unnamed Persona',
          description: data.description || '',
          systemPrompt: data.systemPrompt || '',
          icon: data.icon,
          isHidden: data.isHidden || false,
          createdAt: convertTimestamp(data.createdAt) || new Date(),
          updatedAt: convertTimestamp(data.updatedAt) || new Date(),
        }).onConflictDoNothing();
        
        stats.customPersonas.migrated++;
      } catch (error) {
        console.error(`Error migrating persona ${doc.id}:`, error);
        stats.customPersonas.errors++;
      }
    }
    
    console.log(`  Progress: ${Math.min(i + BATCH_SIZE, snapshot.docs.length)}/${snapshot.docs.length}`);
  }
  
  console.log(`  Custom personas migrated: ${stats.customPersonas.migrated}, errors: ${stats.customPersonas.errors}`);
}

async function main() {
  console.log('=== Firestore to PostgreSQL Migration ===\n');
  
  try {
    console.log('Initializing Firebase...');
    const firestore = await initializeFirebase();
    
    console.log('Starting migration...\n');
    
    await migrateNotes(firestore);
    console.log('');
    
    await migrateFlashcards(firestore);
    console.log('');
    
    await migrateChatSessions(firestore);
    console.log('');
    
    await migrateApiKeys(firestore);
    console.log('');
    
    await migrateCustomPersonas(firestore);
    console.log('');
    
    console.log('=== Migration Summary ===');
    console.log(`Notes: ${stats.notes.migrated} migrated, ${stats.notes.errors} errors`);
    console.log(`Flashcards: ${stats.flashcards.migrated} migrated, ${stats.flashcards.errors} errors`);
    console.log(`Chat Sessions: ${stats.chatSessions.migrated} migrated, ${stats.chatSessions.errors} errors`);
    console.log(`Chat Messages: ${stats.chatMessages.migrated} migrated, ${stats.chatMessages.errors} errors`);
    console.log(`API Keys: ${stats.apiKeys.migrated} migrated, ${stats.apiKeys.errors} errors`);
    console.log(`Custom Personas: ${stats.customPersonas.migrated} migrated, ${stats.customPersonas.errors} errors`);
    
    const totalErrors = Object.values(stats).reduce((sum, s) => sum + s.errors, 0);
    
    if (totalErrors === 0) {
      console.log('\n✅ Migration completed successfully!');
    } else {
      console.log(`\n⚠️ Migration completed with ${totalErrors} errors.`);
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

main();
