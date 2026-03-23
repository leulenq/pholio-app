export interface Project {
  id: string;
  title: string;
  category: string;
  year: string;
  imageUrl: string;
  tags?: string[];
}

export interface ExperienceItem {
  id: string;
  partner: string;    // Was representation
  scope: string;      // Was projectType
  location: string;
  status: string;     // Was international
}

export interface NavItem {
  label: string;
  href: string;
}