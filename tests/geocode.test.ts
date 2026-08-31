import { describe, expect, it } from 'vitest'
import { buildAddressLabel } from '../src/lib/geocode'

describe('buildAddressLabel', () => {
  it('小区 + 区县：拼接为「小区 · 区县」', () => {
    const label = buildAddressLabel({
      address: { residential: '翠苑一区', city_district: '西湖区', city: '杭州市' },
    })
    expect(label).toBe('翠苑一区 · 西湖区')
  })

  it('只有小区没有区县：只返回小区', () => {
    expect(buildAddressLabel({ address: { residential: '万科城市花园' } })).toBe('万科城市花园')
  })

  it('无小区层级：退回邻里/街道，再退回区县', () => {
    expect(buildAddressLabel({ address: { road: '文一西路', suburb: '仓前街道' } })).toBe('仓前街道')
    expect(buildAddressLabel({ address: { county: '桐庐县' } })).toBe('桐庐县')
  })

  it('address 缺失：退回 display_name 首段', () => {
    expect(buildAddressLabel({ display_name: '某地, 某市, 中国' })).toBe('某地')
  })

  it('空数据：返回空串', () => {
    expect(buildAddressLabel(null)).toBe('')
    expect(buildAddressLabel({})).toBe('')
  })

  it('小区与区县同名：不重复拼接', () => {
    expect(buildAddressLabel({ address: { town: '横溪镇', city: '横溪镇' } })).toBe('横溪镇')
  })
})
