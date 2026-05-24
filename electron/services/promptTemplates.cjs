'use strict'
/**
 * promptTemplates.cjs
 * All LLM prompt templates for Cordex AI engine.
 * Language-agnostic by design — every template accepts a `language` param
 * but works fine if it's absent.
 */

// ── Ghost autocomplete ─────────────────────────────────────────────────
// Model: qwen2.5-coder:1.5b-base  (fill-in-the-middle style)
function autocompletePrompt({ before, after, language }) {
  const lang = language || 'code'
  // FIM format that qwen2.5-coder-base understands natively
  return `<|fim_prefix|>${before}<|fim_suffix|>${after}<|fim_middle|>`
}

// ── Bug fix ───────────────────────────────────────────────────────────
function bugFixPrompt({ code, errorMessage, filePath, context }) {
  const ctx = context ? `\n\n## Retrieved context\n${context}` : ''
  const err = errorMessage ? `\n\nError: ${errorMessage}` : ''
  return `You are an expert software engineer. Fix the bug in the code below.
File: ${filePath || 'unknown'}${err}

## Code to fix
\`\`\`
${code}
\`\`\`${ctx}

Return ONLY valid JSON with this shape:
{"explanation": "<one-sentence root cause>", "fixedCode": "<complete fixed code>"}`
}

// ── Refactor ──────────────────────────────────────────────────────────
function refactorPrompt({ code, instruction, language, context }) {
  const lang = language || 'code'
  const ctx  = context ? `\n\n## Related code from project\n${context}` : ''
  return `You are an expert ${lang} engineer. Refactor the code below.
Instruction: ${instruction || 'Improve readability, naming, and structure without changing behaviour.'}${ctx}

## Original code
\`\`\`${lang}
${code}
\`\`\`

Return ONLY valid JSON: {"explanation": "<what changed and why>", "refactoredCode": "<complete refactored code>"}`
}

// ── Explain ───────────────────────────────────────────────────────────
function explainPrompt({ code, language, context }) {
  const lang = language || 'code'
  const ctx  = context ? `\n\n## Related context\n${context}` : ''
  return `Explain the following ${lang} code clearly and concisely.
Include: purpose, key logic, side effects, and potential issues.
Use markdown with short paragraphs and bullet points.${ctx}

## Code
\`\`\`${lang}
${code}
\`\`\``
}

// ── Generate code ─────────────────────────────────────────────────────
function generatePrompt({ instruction, language, context, fileContent }) {
  const lang    = language || 'code'
  const ctxBlock = context ? `\n\n## Project context\n${context}` : ''
  const fileBlock = fileContent
    ? `\n\n## Current file (for style reference)\n\`\`\`${lang}\n${fileContent.slice(0, 1500)}\n\`\`\``
    : ''
  return `You are an expert ${lang} developer. Generate code based on the instruction.
Instruction: ${instruction}${ctxBlock}${fileBlock}

Write clean, idiomatic, production-ready code.
Respond ONLY with the code, no prose or markdown fences.`
}

// ── Architecture reasoning ─────────────────────────────────────────────
function architecturePrompt({ question, fileTree, context }) {
  const tree = fileTree ? `\n\n## Project structure\n\`\`\`\n${fileTree}\n\`\`\`` : ''
  const ctx  = context  ? `\n\n## Relevant code\n${context}` : ''
  return `You are a senior software architect. Answer the architectural question below.
Use markdown. Be concrete with code examples where helpful.${tree}${ctx}

## Question
${question}`
}

// ── Chat / general coding assistant ──────────────────────────────────
function chatSystemPrompt({ projectRoot, fileTree }) {
  const tree = fileTree
    ? `\n\nProject structure:\n\`\`\`\n${fileTree.slice(0, 800)}\n\`\`\``
    : ''
  return `You are Cordex AI, an expert coding assistant built into a local IDE.
You help with code review, bug fixing, refactoring, architecture, and explanations.
Project: ${projectRoot || 'unknown'}${tree}
Be concise, use markdown, include code examples. Never hallucinate file contents.`
}

module.exports = {
  autocompletePrompt,
  bugFixPrompt,
  refactorPrompt,
  explainPrompt,
  generatePrompt,
  architecturePrompt,
  chatSystemPrompt,
}
