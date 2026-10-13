import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { ApiError, api } from '@/api/client'
import EndpointSettings from '../EndpointSettings.vue'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
const props = { projectId: 'p', assetId: 'f', endpoint: null }
describe('EndpointSettings', () => {
  it('validates paths, saves independently and displays the server conflict', async () => {
    const put = vi.spyOn(api, 'put').mockRejectedValueOnce(new ApiError(409, { message: 'Path is already used by Function "Checkout"' }))
    const wrapper = mount(EndpointSettings, { props })
    await wrapper.get('#endpoint-path').setValue('Bad/Path')
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    await wrapper.get('#endpoint-path').setValue('orders/checkout')
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(put).toHaveBeenCalledWith('/projects/p/assets/f/endpoint', { path: 'orders/checkout' })
    expect(wrapper.get('[role="alert"]').text()).toContain('Checkout')
    put.mockResolvedValueOnce({ path: 'orders/checkout', url: 'https://flows.test/run/p/orders/checkout' })
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(wrapper.emitted('updated')?.[0]).toEqual([{ path: 'orders/checkout', url: 'https://flows.test/run/p/orders/checkout' }])
  })
  it('copies the saved URL and removes the endpoint', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const remove = vi.spyOn(api, 'delete').mockResolvedValue(undefined)
    const endpoint = { path: 'orders/checkout', url: 'https://flows.test/run/p/orders/checkout' }
    const wrapper = mount(EndpointSettings, { props: { ...props, endpoint } })
    const buttons = wrapper.findAll('button')
    await buttons.find((button) => button.text() === 'Copy URL')!.trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith(endpoint.url)
    await buttons.find((button) => button.text() === 'Remove endpoint')!.trigger('click')
    await flushPromises()
    expect(remove).toHaveBeenCalledWith('/projects/p/assets/f/endpoint')
    expect(wrapper.emitted('updated')?.[0]).toEqual([null])
    vi.unstubAllGlobals()
  })
})
