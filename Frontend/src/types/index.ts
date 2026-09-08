// Course types
export interface Course {
  id: number;
  name: string;
  description: string;
  thumbnail: string;
  slug: string;
  rating_average: number | null;
  rating_count: number;
}

// Class types
export interface Class {
  id: number;
  title: string;
  description: string;
  video: string;
  duration: number;
  slug: string;
}

// Class summary as returned nested inside GET /courses/:slug (id, name, description, slug only)
export interface CourseClassSummary {
  id: number;
  name: string;
  description: string;
  slug: string;
}

// Course Detail type
export interface CourseDetail extends Course {
  teacher_id: number[];
  classes: CourseClassSummary[];
}

// Progress types
export interface Progress {
  progress: number; // seconds
  user_id: number;
}

// Quiz types
export interface QuizOption {
  id: number;
  answer: string;
  correct: boolean;
}

export interface Quiz {
  id: number;
  question: string;
  options: QuizOption[];
}

// Favorite types
export interface FavoriteToggle {
  course_id: number;
}

// Rating types
export interface RatingCreate {
  stars: number;
}

export interface RatingSummary {
  rating_average: number | null;
  rating_count: number;
}