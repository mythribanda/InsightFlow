"""
Module for parsing, validating, and evaluating user-defined calculated columns.
Uses a direct AST-walking interpreter over a whitelisted grammar (no eval() or exec()).
"""

import ast
import re
import numpy as np
import pandas as pd
from typing import Dict, List, Tuple, Any, Optional

# List of allowed AST node types for security validation
ALLOWED_NODES = {
    ast.Expression,
    ast.BinOp,
    ast.UnaryOp,
    ast.Compare,
    ast.BoolOp,
    ast.IfExp,
    ast.Constant,  # Python 3.8+
    ast.Num,       # Python 3.7 fallback
    ast.Str,       # Python 3.7 fallback
    ast.NameConstant, # Python 3.7 fallback
    ast.Name,
    ast.Call,
    # Arithmetic operators
    ast.Add, ast.Sub, ast.Mult, ast.Div, ast.FloorDiv, ast.Mod, ast.Pow,
    # Unary/Logical operators
    ast.USub, ast.UAdd, ast.Not,
    # Boolean operators
    ast.And, ast.Or,
    # Comparison operators
    ast.Eq, ast.NotEq, ast.Lt, ast.LtE, ast.Gt, ast.GtE,
    # Context (required for reading Name references)
    ast.Load,
}

# Whitelist of allowed functions
ALLOWED_FUNCTIONS = {"IF", "ROUND", "ABS", "AVG", "SUM", "COUNT"}


def validate_ast(node: ast.AST):
    """Recursively validates that the AST contains only whitelisted node types."""
    if type(node) not in ALLOWED_NODES:
        raise ValueError(f"Security validation failed: expressions cannot contain '{type(node).__name__}' operations.")
    
    for child in ast.iter_child_nodes(node):
        validate_ast(child)


def parse_backticks_and_validate(formula: str, df: pd.DataFrame) -> Tuple[str, Dict[str, str]]:
    """
    Finds backticked column references (e.g. `sepal length (cm)`), validates that
    they exist in the DataFrame columns, and replaces them with safe identifiers
    to make the formula string syntactically valid Python.
    """
    backtick_pattern = r'`([^`]+)`'
    matches = re.findall(backtick_pattern, formula)
    
    placeholders = {}
    modified_formula = formula
    
    for idx, col_name in enumerate(matches):
        if col_name not in df.columns:
            raise ValueError(f"Column '{col_name}' referenced in the formula does not exist in the dataset.")
        
        # Map to a safe placeholder name
        placeholder = f"__col_placeholder_{idx}"
        placeholders[placeholder] = col_name
        
        # Replace exact backticked match
        modified_formula = modified_formula.replace(f"`{col_name}`", placeholder)
        
    return modified_formula, placeholders


def evaluate_node(node: ast.AST, df: pd.DataFrame, placeholders: Dict[str, str]) -> Any:
    """Recursively evaluates AST nodes directly using vectorized pandas/numpy operations."""
    
    if isinstance(node, ast.Expression):
        return evaluate_node(node.body, df, placeholders)
        
    elif isinstance(node, (ast.Constant, ast.Num, ast.Str, ast.NameConstant)):
        if hasattr(node, 'value'):
            return node.value
        elif hasattr(node, 'n'):
            return node.n
        elif hasattr(node, 's'):
            return node.s
        return None
        
    elif isinstance(node, ast.Name):
        name = node.id
        if name == "True":
            return True
        elif name == "False":
            return False
        elif name == "None":
            return None
        if name in placeholders:
            return df[placeholders[name]]
        if name in df.columns:
            return df[name]
        raise ValueError(f"Column reference or variable '{name}' not found in the dataset.")
        
    elif isinstance(node, ast.BinOp):
        left = evaluate_node(node.left, df, placeholders)
        right = evaluate_node(node.right, df, placeholders)
        op_type = type(node.op)
        
        if op_type == ast.Add:
            return left + right
        elif op_type == ast.Sub:
            return left - right
        elif op_type == ast.Mult:
            return left * right
        elif op_type == ast.Div:
            return left / right
        elif op_type == ast.FloorDiv:
            return left // right
        elif op_type == ast.Mod:
            return left % right
        elif op_type == ast.Pow:
            return left ** right
        else:
            raise ValueError(f"Unsupported arithmetic operator: {op_type.__name__}")
            
    elif isinstance(node, ast.UnaryOp):
        operand = evaluate_node(node.operand, df, placeholders)
        op_type = type(node.op)
        
        if op_type == ast.USub:
            return -operand
        elif op_type == ast.UAdd:
            return +operand
        elif op_type == ast.Not:
            if isinstance(operand, (pd.Series, np.ndarray)):
                return ~operand
            return not operand
        else:
            raise ValueError(f"Unsupported unary operator: {op_type.__name__}")
            
    elif isinstance(node, ast.Compare):
        left = evaluate_node(node.left, df, placeholders)
        res = None
        current_left = left
        
        for op, comparator in zip(node.ops, node.comparators):
            right = evaluate_node(comparator, df, placeholders)
            op_type = type(op)
            
            if op_type == ast.Eq:
                step = (current_left == right)
            elif op_type == ast.NotEq:
                step = (current_left != right)
            elif op_type == ast.Lt:
                step = (current_left < right)
            elif op_type == ast.LtE:
                step = (current_left <= right)
            elif op_type == ast.Gt:
                step = (current_left > right)
            elif op_type == ast.GtE:
                step = (current_left >= right)
            else:
                raise ValueError(f"Unsupported comparison operator: {op_type.__name__}")
                
            res = step if res is None else (res & step)
            current_left = right
        return res
        
    elif isinstance(node, ast.BoolOp):
        values = [evaluate_node(val, df, placeholders) for val in node.values]
        op_type = type(node.op)
        
        if op_type == ast.And:
            res = values[0]
            for val in values[1:]:
                res = res & val
            return res
        elif op_type == ast.Or:
            res = values[0]
            for val in values[1:]:
                res = res | val
            return res
        else:
            raise ValueError(f"Unsupported boolean operator: {op_type.__name__}")
            
    elif isinstance(node, ast.IfExp):
        test = evaluate_node(node.test, df, placeholders)
        body = evaluate_node(node.body, df, placeholders)
        orelse = evaluate_node(node.orelse, df, placeholders)
        return np.where(test, body, orelse)
        
    elif isinstance(node, ast.Call):
        if not isinstance(node.func, ast.Name):
            raise ValueError("Function call name must be a simple identifier.")
        func_name = node.func.id.upper()
        
        if func_name not in ALLOWED_FUNCTIONS:
            raise ValueError(f"Unsupported function call: '{func_name}'.")
            
        args = [evaluate_node(arg, df, placeholders) for arg in node.args]
        
        if func_name == "IF":
            if len(args) != 3:
                raise ValueError("IF function requires 3 arguments: IF(condition, true_value, false_value)")
            return np.where(args[0], args[1], args[2])
            
        elif func_name == "ROUND":
            if len(args) == 1:
                return np.round(args[0])
            elif len(args) == 2:
                try:
                    decimals = int(args[1])
                except Exception:
                    raise ValueError("ROUND second argument (decimals) must resolve to an integer.")
                return np.round(args[0], decimals)
            else:
                raise ValueError("ROUND function requires 1 or 2 arguments: ROUND(val, decimals=0)")
                
        elif func_name == "ABS":
            if len(args) != 1:
                raise ValueError("ABS function requires exactly 1 argument: ABS(val)")
            return np.abs(args[0])
            
        elif func_name == "AVG":
            if len(args) != 1:
                raise ValueError("AVG function requires exactly 1 argument: AVG(column)")
            val = args[0]
            if not isinstance(val, (pd.Series, np.ndarray)):
                raise ValueError("AVG argument must resolve to a column reference.")
            mean_val = float(val.mean()) if hasattr(val, 'mean') else float(np.mean(val))
            return mean_val
            
        elif func_name == "SUM":
            if len(args) != 1:
                raise ValueError("SUM function requires exactly 1 argument: SUM(column)")
            val = args[0]
            if not isinstance(val, (pd.Series, np.ndarray)):
                raise ValueError("SUM argument must resolve to a column reference.")
            sum_val = float(val.sum()) if hasattr(val, 'sum') else float(np.sum(val))
            return sum_val
            
        elif func_name == "COUNT":
            if len(args) != 1:
                raise ValueError("COUNT function requires exactly 1 argument: COUNT(column)")
            val = args[0]
            if not isinstance(val, (pd.Series, np.ndarray)):
                raise ValueError("COUNT argument must resolve to a column reference.")
            count_val = int(val.count()) if hasattr(val, 'count') else int(len(val))
            return count_val
            
    raise ValueError(f"Unsupported expression component: '{type(node).__name__}'.")


def add_calculated_column(df: pd.DataFrame, name: str, formula: str) -> Tuple[pd.DataFrame, List[Any], Optional[str]]:
    """
    Validates, parses, and evaluates the given formula on the DataFrame.
    Returns (updated_df, preview_first_10_values, error_message_or_None).
    """
    # Validation: column name check
    if not name or not name.strip():
        return df, [], "Column name cannot be empty."
    
    clean_name = name.strip()
    if clean_name in df.columns:
        return df, [], f"Column '{clean_name}' already exists in the dataset."
        
    try:
        # Step 1: Handle backticks and validate existence of references before parsing
        modified_formula, placeholders = parse_backticks_and_validate(formula, df)
        
        # Step 2: Parse into AST
        tree = ast.parse(modified_formula, mode='eval')
        
        # Step 4: Security whitelist check on AST
        validate_ast(tree)
        
        # Step 5: Direct direct walk evaluation
        result = evaluate_node(tree, df, placeholders)
        
        # Convert result to a Series to add it
        if isinstance(result, (pd.Series, np.ndarray)):
            # Force size match
            if len(result) != len(df):
                return df, [], f"Calculated expression returned {len(result)} values, but dataset has {len(df)} rows."
            new_series = pd.Series(result, index=df.index)
        else:
            # Scalar result: broadcast to all rows
            new_series = pd.Series([result] * len(df), index=df.index)
            
        # Add to df copy
        updated_df = df.copy()
        updated_df[clean_name] = new_series
        
        # Generate preview (returns all values to allow frontend row merging)
        preview_values = new_series.tolist()
        # Replace float NaN/Inf for JSON serialization compatibility
        preview_values = [
            None if isinstance(v, float) and (np.isnan(v) or np.isinf(v)) else v
            for v in preview_values
        ]
        
        return updated_df, preview_values, None
        
    except SyntaxError as e:
        return df, [], f"Syntax error in formula: {str(e)}"
    except ValueError as e:
        return df, [], str(e)
    except Exception as e:
        return df, [], f"Evaluation error: {str(e)}"
