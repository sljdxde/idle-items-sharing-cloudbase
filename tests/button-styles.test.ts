// ================================================
// tests/button-styles.test.ts — 按钮禁用态样式契约
// 「点了没反应」有一半是样式造成的：按钮被 :disabled 禁掉了，却既没有禁用态视觉、
// hover 还照常高亮，用户以为它可点，于是反复点击。
// 断言对象是源码本身：模板里每个会被禁用的 <button>，其类名组合必须
// 1) 至少有一个类带 :disabled 样式（禁用时看得出禁用）
// 2) 类上的 :hover/:active 规则排除禁用态（禁用时不再高亮误导）
// 作用域按真机规则解析：src/**/*.css 为全局，组件 <style scoped> 只作用于本文件，
// 因此 btn-block / btn-submit 这类纯修饰类由其基座类（btn-memphis-primary）负责禁用态。
// ================================================

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(__dirname, '..', 'src')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

const files = walk(SRC)
const globalCss = files.filter((f) => f.endsWith('.css')).map((f) => readFileSync(f, 'utf8'))

/** 某文件里的样式在此处是否可见（全局 css + 自己的 scoped style） */
function cssVisibleIn(file: string): string {
  const own = file.endsWith('.vue')
    ? [...readFileSync(file, 'utf8').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
        .map((m) => m[1])
        .join('\n')
    : ''
  return [...globalCss, own].join('\n').replace(/\/\*[\s\S]*?\*\//g, '')
}

/** 扁平规则的选择器列表（@media 内层规则同样会被解析出来） */
function selectors(css: string): string[] {
  return [...css.matchAll(/([^{}]+)\{[^{}]*\}/g)]
    .flatMap((m) => m[1].split(',').map((s) => s.trim()))
    .filter(Boolean)
}

function classesMatching(css: string, test: (sel: string) => boolean): string[] {
  const hits = new Set<string>()
  for (const sel of selectors(css)) {
    if (!test(sel)) continue
    for (const m of sel.matchAll(/\.([\w-]+)/g)) hits.add(m[1])
  }
  return [...hits]
}

type DisableableButton = { file: string; line: number; classes: string[] }

/** 模板里带 :disabled 表达式的 <button> 及其 btn-* 类名组合 */
function disableableButtons(): DisableableButton[] {
  const out: DisableableButton[] = []
  for (const f of files.filter((x) => x.endsWith('.vue'))) {
    const src = readFileSync(f, 'utf8')
    for (const m of src.matchAll(/<button[^>]*:disabled[^>]*>/gs)) {
      const classes = (/class="([^"]*)"/.exec(m[0])?.[1] ?? '')
        .split(/\s+/)
        .filter((c) => c.startsWith('btn-'))
      out.push({
        file: f,
        line: src.slice(0, m.index).split('\n').length,
        classes,
      })
    }
  }
  return out
}

const buttons = disableableButtons().map((b) => ({
  title: `${relative(SRC, b.file)}:${b.line} .${b.classes.join(' .')}`,
  b,
}))

describe('可禁用按钮的样式契约', () => {
  it('脚手架有效：源码里确实存在会被禁用的按钮', () => {
    expect(buttons.length).toBeGreaterThan(0)
  })

  it('按钮类名组合都被识别（新增禁用按钮时不要漏网）', () => {
    expect([...new Set(buttons.flatMap(({ b }) => b.classes))]).toEqual(
      expect.arrayContaining([
        'btn-memphis-primary',
        'btn-memphis-secondary',
        'btn-item-borrow',
        'btn-item-manage',
        'btn-act',
        'btn-photo',
        'btn-loc-retry',
      ]),
    )
  })

  it.each(buttons)('$title：禁用态有视觉区分', ({ b }) => {
    const disabled = classesMatching(cssVisibleIn(b.file), (sel) => sel.includes(':disabled'))
    const skinned = b.classes.filter((c) => disabled.includes(c))
    expect(
      skinned.length,
      `${relative(SRC, b.file)} 上 .${b.classes.join(' .')} 全无 :disabled 样式，禁用时看不出不可点`,
    ).toBeGreaterThan(0)
  })

  it.each(buttons)('$title：禁用时 hover/active 不再高亮', ({ b }) => {
    const css = cssVisibleIn(b.file)
    const misleading = classesMatching(
      css,
      (sel) => /:(hover|active)(?!.*:not\(:disabled\))/.test(sel),
    ).filter((c) => b.classes.includes(c))
    expect(misleading, `禁用态仍会命中 ${misleading.map((c) => `.${c}`).join(' ')}`).toEqual([])
  })
})
