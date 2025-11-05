import React, { useState } from 'react';
import { useQuery } from 'wasp/client/operations';
import { getClassifications, getCategoryDefinitions } from 'wasp/client/operations';
import { 
  createClassification, 
  updateClassification, 
  deleteClassification,
  createCategoryDefinition,
  updateCategoryDefinition,
  deleteCategoryDefinition,
  createSubcategory,
  updateSubcategory,
  deleteSubcategory,
  seedDefaultClassifications,
  seedDefaultCategories
} from 'wasp/client/operations';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Plus, Edit2, Trash2, GripVertical, RefreshCw } from 'lucide-react';
import { cn } from '../lib/utils';

const CategoryManagement = () => {
  const [activeTab, setActiveTab] = useState('categories');
  const { data: classifications, refetch: refetchClassifications } = useQuery(getClassifications);
  const { data: categoryDefinitions, refetch: refetchCategories } = useQuery(getCategoryDefinitions);
  
  // Categories state
  const [editingCategory, setEditingCategory] = useState(null);
  const [categoryName, setCategoryName] = useState('');
  const [categoryDisplayOrder, setCategoryDisplayOrder] = useState(0);
  const [newSubcategoryName, setNewSubcategoryName] = useState('');
  const [addingSubcategoryTo, setAddingSubcategoryTo] = useState(null);
  
  // Classifications state
  const [editingClassification, setEditingClassification] = useState(null);
  const [classificationName, setClassificationName] = useState('');
  const [classificationDisplayOrder, setClassificationDisplayOrder] = useState(0);
  
  // Subcategories state
  const [editingSubcategory, setEditingSubcategory] = useState(null);
  const [subcategoryName, setSubcategoryName] = useState('');
  const [subcategoryDisplayOrder, setSubcategoryDisplayOrder] = useState(0);

  const handleSeedClassifications = async () => {
    if (confirm('Seed default classifications (Sativa, Hybrid, Indica, Blend, CBD)?')) {
      try {
        const result = await seedDefaultClassifications();
        alert(`${result.created} classifications created!`);
        refetchClassifications();
      } catch (error) {
        alert('Error: ' + error.message);
      }
    }
  };

  const handleSeedCategories = async () => {
    if (confirm('Seed default categories and subcategories?')) {
      try {
        const result = await seedDefaultCategories();
        alert(`${result.categoriesCreated} categories and ${result.subcategoriesCreated} subcategories created!`);
        refetchCategories();
      } catch (error) {
        alert('Error: ' + error.message);
      }
    }
  };

  const handleCreateClassification = async () => {
    if (!classificationName.trim()) return;
    try {
      await createClassification({ 
        name: classificationName.trim(), 
        displayOrder: classificationDisplayOrder 
      });
      setClassificationName('');
      setClassificationDisplayOrder(0);
      refetchClassifications();
    } catch (error) {
      alert('Error: ' + error.message);
    }
  };

  const handleUpdateClassification = async (id) => {
    try {
      await updateClassification({ 
        id, 
        name: classificationName.trim(), 
        displayOrder: classificationDisplayOrder 
      });
      setEditingClassification(null);
      setClassificationName('');
      setClassificationDisplayOrder(0);
      refetchClassifications();
    } catch (error) {
      alert('Error: ' + error.message);
    }
  };

  const handleDeleteClassification = async (id) => {
    if (confirm('Delete this classification?')) {
      try {
        await deleteClassification({ id });
        refetchClassifications();
      } catch (error) {
        alert('Error: ' + error.message);
      }
    }
  };

  const handleCreateCategory = async () => {
    if (!categoryName.trim()) return;
    try {
      await createCategoryDefinition({ 
        name: categoryName.trim(), 
        displayOrder: categoryDisplayOrder 
      });
      setCategoryName('');
      setCategoryDisplayOrder(0);
      refetchCategories();
    } catch (error) {
      alert('Error: ' + error.message);
    }
  };

  const handleUpdateCategory = async (id) => {
    try {
      await updateCategoryDefinition({ 
        id, 
        name: categoryName.trim(), 
        displayOrder: categoryDisplayOrder 
      });
      setEditingCategory(null);
      setCategoryName('');
      setCategoryDisplayOrder(0);
      refetchCategories();
    } catch (error) {
      alert('Error: ' + error.message);
    }
  };

  const handleDeleteCategory = async (id) => {
    if (confirm('Delete this category and all its subcategories?')) {
      try {
        await deleteCategoryDefinition({ id });
        refetchCategories();
      } catch (error) {
        alert('Error: ' + error.message);
      }
    }
  };

  const handleCreateSubcategory = async (categoryId) => {
    if (!newSubcategoryName.trim()) return;
    try {
      await createSubcategory({ 
        categoryId, 
        name: newSubcategoryName.trim(), 
        displayOrder: categoryDefinitions.find(c => c.id === categoryId)?.subcategories.length || 0 
      });
      setNewSubcategoryName('');
      setAddingSubcategoryTo(null);
      refetchCategories();
    } catch (error) {
      alert('Error: ' + error.message);
    }
  };

  const handleUpdateSubcategory = async (id) => {
    try {
      await updateSubcategory({ 
        id, 
        name: subcategoryName.trim(), 
        displayOrder: subcategoryDisplayOrder 
      });
      setEditingSubcategory(null);
      setSubcategoryName('');
      setSubcategoryDisplayOrder(0);
      refetchCategories();
    } catch (error) {
      alert('Error: ' + error.message);
    }
  };

  const handleDeleteSubcategory = async (id) => {
    if (confirm('Delete this subcategory?')) {
      try {
        await deleteSubcategory({ id });
        refetchCategories();
      } catch (error) {
        alert('Error: ' + error.message);
      }
    }
  };

  const allSubcategories = categoryDefinitions?.flatMap(cat => 
    cat.subcategories.map(sub => ({ ...sub, categoryName: cat.name }))
  ) || [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Product Classifications & Categories</h1>
        <div className="flex gap-2">
          <Button onClick={handleSeedClassifications} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Seed Classifications
          </Button>
          <Button onClick={handleSeedCategories} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Seed Categories
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setActiveTab('categories')}
          className={cn(
            "px-4 py-2 font-medium border-b-2 transition-colors",
            activeTab === 'categories' 
              ? "border-emerald-600 text-emerald-600" 
              : "border-transparent text-gray-500 hover:text-gray-700"
          )}
        >
          Categories
        </button>
        <button
          onClick={() => setActiveTab('classifications')}
          className={cn(
            "px-4 py-2 font-medium border-b-2 transition-colors",
            activeTab === 'classifications' 
              ? "border-emerald-600 text-emerald-600" 
              : "border-transparent text-gray-500 hover:text-gray-700"
          )}
        >
          Classifications
        </button>
        <button
          onClick={() => setActiveTab('subcategories')}
          className={cn(
            "px-4 py-2 font-medium border-b-2 transition-colors",
            activeTab === 'subcategories' 
              ? "border-emerald-600 text-emerald-600" 
              : "border-transparent text-gray-500 hover:text-gray-700"
          )}
        >
          Subcategories
        </button>
      </div>

      {/* Categories Tab */}
      {activeTab === 'categories' && (
        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex gap-2 mb-4">
              <Input
                placeholder="Category name"
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                className="flex-1"
              />
              <Input
                type="number"
                placeholder="Order"
                value={categoryDisplayOrder}
                onChange={(e) => setCategoryDisplayOrder(parseInt(e.target.value) || 0)}
                className="w-24"
              />
              <Button onClick={editingCategory ? () => handleUpdateCategory(editingCategory.id) : handleCreateCategory}>
                <Plus className="h-4 w-4 mr-2" />
                {editingCategory ? 'Update' : 'Add'} Category
              </Button>
              {editingCategory && (
                <Button variant="outline" onClick={() => {
                  setEditingCategory(null);
                  setCategoryName('');
                  setCategoryDisplayOrder(0);
                }}>
                  Cancel
                </Button>
              )}
            </div>
          </Card>

          <div className="space-y-2">
            {categoryDefinitions?.map(category => (
              <Card key={category.id} className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <GripVertical className="h-5 w-5 text-gray-400" />
                    <h3 className="font-semibold">{category.name}</h3>
                    <Badge variant="outline">{category.subcategories.length} subcategories</Badge>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditingCategory(category);
                        setCategoryName(category.name);
                        setCategoryDisplayOrder(category.displayOrder);
                      }}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteCategory(category.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="mt-2 space-y-1">
                  {category.subcategories.map(sub => (
                    <div key={sub.id} className="flex items-center gap-2 text-sm text-gray-600 pl-6">
                      <span>•</span>
                      <span>{sub.name}</span>
                    </div>
                  ))}
                  {addingSubcategoryTo === category.id ? (
                    <div className="flex gap-2 pl-6 mt-2">
                      <Input
                        placeholder="Subcategory name"
                        value={newSubcategoryName}
                        onChange={(e) => setNewSubcategoryName(e.target.value)}
                        className="flex-1"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleCreateSubcategory(category.id);
                          }
                        }}
                      />
                      <Button size="sm" onClick={() => handleCreateSubcategory(category.id)}>
                        Add
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => {
                        setAddingSubcategoryTo(null);
                        setNewSubcategoryName('');
                      }}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="pl-6 mt-2"
                      onClick={() => setAddingSubcategoryTo(category.id)}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add Subcategory
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Classifications Tab */}
      {activeTab === 'classifications' && (
        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex gap-2 mb-4">
              <Input
                placeholder="Classification name (e.g., Sativa, Hybrid)"
                value={classificationName}
                onChange={(e) => setClassificationName(e.target.value)}
                className="flex-1"
              />
              <Input
                type="number"
                placeholder="Order"
                value={classificationDisplayOrder}
                onChange={(e) => setClassificationDisplayOrder(parseInt(e.target.value) || 0)}
                className="w-24"
              />
              <Button onClick={editingClassification ? () => handleUpdateClassification(editingClassification.id) : handleCreateClassification}>
                <Plus className="h-4 w-4 mr-2" />
                {editingClassification ? 'Update' : 'Add'} Classification
              </Button>
              {editingClassification && (
                <Button variant="outline" onClick={() => {
                  setEditingClassification(null);
                  setClassificationName('');
                  setClassificationDisplayOrder(0);
                }}>
                  Cancel
                </Button>
              )}
            </div>
          </Card>

          <div className="space-y-2">
            {classifications?.map(classification => (
              <Card key={classification.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <GripVertical className="h-5 w-5 text-gray-400" />
                    <span className="font-semibold">{classification.name}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditingClassification(classification);
                        setClassificationName(classification.name);
                        setClassificationDisplayOrder(classification.displayOrder);
                      }}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteClassification(classification.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Subcategories Tab */}
      {activeTab === 'subcategories' && (
        <div className="space-y-2">
          {allSubcategories.map(subcategory => (
            <Card key={subcategory.id} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{subcategory.categoryName}</Badge>
                  <span className="font-semibold">{subcategory.name}</span>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditingSubcategory(subcategory);
                      setSubcategoryName(subcategory.name);
                      setSubcategoryDisplayOrder(subcategory.displayOrder);
                    }}
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteSubcategory(subcategory.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default CategoryManagement;

