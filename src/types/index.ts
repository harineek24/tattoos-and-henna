export interface Design {
  id: string;
  name: string;
  image_url: string;
  created_at: string;
}

export interface PlacedDesign {
  id: string;
  designId: string;
  image_url: string;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
}
