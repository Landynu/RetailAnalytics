import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

const KPICard = ({ 
  title, 
  value, 
  description, 
  icon: Icon, 
  iconColor = 'text-muted-foreground',
  bgColor = '',
  loading = false 
}) => {
  if (loading) {
    return (
      <Card className={bgColor}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium animate-pulse bg-muted h-4 w-24 rounded"></CardTitle>
          {Icon && <div className="h-4 w-4 bg-muted rounded animate-pulse"></div>}
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold animate-pulse bg-muted h-8 w-32 rounded mb-1"></div>
          <div className="text-xs animate-pulse bg-muted h-3 w-20 rounded"></div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={bgColor}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {Icon && <Icon className={`h-4 w-4 ${iconColor}`} />}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </CardContent>
    </Card>
  );
};

export default KPICard;
