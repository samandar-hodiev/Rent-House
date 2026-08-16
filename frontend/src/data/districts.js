export const DISTRICTS = [
  { id: 'sergeli', name: 'Sergeli' },
  { id: 'chilonzor', name: 'Chilonzor' },
  { id: 'yunusobod', name: 'Yunusobod' },
  { id: 'shayxontohur', name: 'Shayxontohur' },
  { id: 'mirobod', name: 'Mirobod' },
  { id: 'yakkasaroy', name: 'Yakkasaroy' },
  { id: 'olmazor', name: 'Olmazor' },
  { id: 'uchtepa', name: 'Uchtepa' },
  { id: 'bektemir', name: 'Bektemir' },
  { id: 'yashnobod', name: 'Yashnobod' },
  { id: 'yangihayot', name: 'Yangihayot' },
  { id: 'mirzo-ulugbek', name: "Mirzo Ulug'bek" },
]

export function getDistrictById(id) {
  return DISTRICTS.find((district) => district.id === id) ?? null
}
