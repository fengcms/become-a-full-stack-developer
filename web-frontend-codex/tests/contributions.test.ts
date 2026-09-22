import assert from 'node:assert/strict'
import test from 'node:test'
import {
  categoryChoices,
  draftFields,
  saveStatus,
  validateDraft,
} from '../lib/contribution-model.ts'

test('submission requires category but local drafts do not, with server length boundaries', () => {
  const draft = draftFields({ title: '标题', content: '正文' })
  assert.equal(validateDraft(draft, false), '')
  assert.match(validateDraft(draft, true), /分类/)
  assert.equal(validateDraft({ ...draft, categoryId: 1 }, true), '')
  assert.match(validateDraft({ ...draft, content: ' ' }, false), /正文/)
  assert.match(validateDraft({ ...draft, content: 'x'.repeat(65536) }, false), /65,535/)
  assert.match(validateDraft({ ...draft, title: 'x'.repeat(201) }, false), /200/)
})
test('membership editor never requests published, including privileged visitors', () => {
  assert.equal(saveStatus('published'), 'pending')
  assert.equal(saveStatus('pending'), 'pending')
  assert.equal(saveStatus('draft'), 'draft')
  assert.equal(saveStatus(), 'draft')
})
test('same-named nested categories retain full paths', () => {
  assert.deepEqual(
    categoryChoices([{ id: 1, name: '前端', children: [{ id: 2, name: '实践' }] }]),
    [
      { id: 1, label: '前端' },
      { id: 2, label: '前端 / 实践' },
    ],
  )
})
