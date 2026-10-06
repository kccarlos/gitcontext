import { test, expect } from '@playwright/test'

test('the built site loads under /gitcontext/ with every asset found', async ({ page }) => {
  const failed: string[] = []
  const errors: string[] = []
  page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`) })
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('./')
  await expect(page.getByRole('button', { name: /Select Project Folder/i })).toBeVisible()

  const logo = page.locator('header img').first()
  await expect(logo).toHaveAttribute('src', /^\/gitcontext\//)
  expect(await logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true)

  // Public files the app fetches at run time resolve under the base path.
  const example = await page.request.get('example-output.txt')
  expect(example.ok()).toBe(true)

  expect(failed).toEqual([])
  expect(errors).toEqual([])
})
